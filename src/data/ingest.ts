/**
 * Ingestão idempotente. É onde os Princípios III e VI viram código.
 *
 * - INSERT OR IGNORE sobre (node_id, seq): reimportar é operação sem efeito.
 * - Commit por lote: uma queda preserva tudo que já chegou.
 * - A hora NÃO é calculada aqui (feature 003, D-302): o lote 1 de uma coleta
 *   pode ser de uma ligada antiga do nó, e só o lote 5 revela o reinício.
 *   Cada leitura entra "em avaliação", sem hora, e `atualizarHoras`
 *   (data/hora.ts) decide no fim da coleta, por correção à parte.
 * - Resumos calculados só sobre amostras válidas E com hora conhecida, com a
 *   contagem de excluídas ao lado. A UI nunca agrega ao renderizar.
 */
import type { ClockAnchor, NodeInfo, Reading } from '@/core/ports/transport';
import type { SqlDb } from './types';

export interface ResultadoIngestao {
  inseridas: number;
  recebidas: number;
  ultimoSeq: number;
}

/** O que a sessão sabe sobre as leituras que está entregando. */
export interface OrigemDoLote {
  /** O que o nó disse saber de tempo (`NodeInfo.clockMode`). Fica gravado em cada leitura. */
  clockMode: NodeInfo['clockMode'];
}

/** Converte o contador do nó em tempo de parede a partir de uma âncora. */
export function paraTempoUtc(tNode: number, anchor: ClockAnchor): number {
  return anchor.tUtcAtAnchorMs - (anchor.tNodeAtAnchor - tNode) * 1000;
}

/**
 * Ingere um lote. Idempotente por construção: a chave primária (node_id, seq)
 * mais INSERT OR IGNORE fazem a segunda importação não mudar nada.
 *
 * A hora entra em branco, com qualidade 3 e motivo `em-avaliacao`: é a verdade
 * no instante da gravação. `boot_id` também fica em branco — o nó não o manda
 * por leitura, e copiar o da sessão atribuía leituras de antes de um reinício à
 * ligada atual (achado relogio:1).
 */
export function ingerirLote(
  db: SqlDb,
  nodeId: number,
  lote: Reading[],
  origem: OrigemDoLote,
  protoVer: number,
  src: string,
  sensorEpoch = 1,
  calibVersion = 1,
): ResultadoIngestao {
  let r: ResultadoIngestao = { inseridas: 0, recebidas: 0, ultimoSeq: 0 };
  if (lote.length === 0) return r;
  db.transaction(() => {
    r = ingerirLoteSemTransacao(db, nodeId, lote, origem, protoVer, src, sensorEpoch, calibVersion);
  });
  return r;
}

/** Linhas por INSERT: 24 parâmetros cada, longe do limite de 32.766 do SQLite. */
const LINHAS_POR_INSERT = 500;

/**
 * O mesmo, para quem já está numa transação (a coleta pelo cabo grava sessão,
 * leituras e referência de hora juntas, antes de confirmar à placa — 005, D-502).
 * O driver do navegador não aninha transação.
 */
export function ingerirLoteSemTransacao(
  db: SqlDb,
  nodeId: number,
  lote: Reading[],
  origem: OrigemDoLote,
  protoVer: number,
  src: string,
  sensorEpoch = 1,
  calibVersion = 1,
): ResultadoIngestao {
  if (lote.length === 0) return { inseridas: 0, recebidas: 0, ultimoSeq: 0 };

  const antes = contar(db, nodeId);
  const agora = Date.now();

  // Um INSERT multi-linha por bloco. Preparar uma instrução por leitura domina
  // o custo em sql.js e deixaria a coleta lenta demais em campo.
  const COLS = 24;
  const tupla = `(${new Array(COLS).fill('?').join(',')})`;
  for (let i = 0; i < lote.length; i += LINHAS_POR_INSERT) {
    const bloco = lote.slice(i, i + LINHAS_POR_INSERT);
    const params: unknown[] = [];
    for (const r of bloco) {
      params.push(
        nodeId, r.seq, r.tNode, null, 3, 'em-avaliacao',
        r.tempC100, r.rhX100, r.tvocPpb, r.eco2Ppm, r.aqiUba, r.gasStatus,
        r.battMv, r.flags, null, r.ligada ?? null, origem.clockMode,
        sensorEpoch, calibVersion, protoVer, src, agora,
        r.tempBruto ?? null, r.rhBruto ?? null,
      );
    }
    db.run(
      `INSERT OR IGNORE INTO reading
        (node_id, seq, t_node, t_utc_ms, t_quality, t_motivo, temp_c100, rh_x100,
         tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags, boot_id,
         boot_no, clock_mode, sensor_epoch, calib_version, proto_ver, src, ing_ms,
         temp_bruto, rh_bruto)
       VALUES ${new Array(bloco.length).fill(tupla).join(',')}`,
      params,
    );
  }

  const depois = contar(db, nodeId);
  return {
    inseridas: depois - antes,
    recebidas: lote.length,
    ultimoSeq: lote[lote.length - 1].seq,
  };
}

function contar(db: SqlDb, nodeId: number): number {
  return db.all<{ c: number }>(
    'SELECT COUNT(*) AS c FROM reading WHERE node_id = ?', [nodeId],
  )[0].c;
}

/**
 * Recalcula os resumos diários do nó.
 *
 * Três regras viram SQL aqui:
 *  - só `gas_status = 0` (ou NULL) entra nas médias de gás (Princípio VI);
 *  - `excluded_count` acompanha o resultado — agregado sem essa contagem
 *    mente por omissão;
 *  - a hora é a EFETIVA (VIEW `leitura_hora`), e leitura sem hora conhecida
 *    fica de fora (FR-017, SC-004). Ela é contada à parte por `contarSemHora`.
 * Dia sem amostra válida não gera linha: a ausência é o que vira lacuna no gráfico.
 */
export function recalcularResumos(db: SqlDb, nodeId: number): void {
  db.transaction(() => recalcularResumosSemTransacao(db, nodeId));
}

/** O mesmo, para quem já está dentro de uma transação (o driver web não aninha). */
export function recalcularResumosSemTransacao(db: SqlDb, nodeId: number): void {
  db.run('DELETE FROM reading_daily WHERE node_id = ?', [nodeId]);
  db.run(
    `INSERT INTO reading_daily
       (node_id, day, temp_p5, temp_med, temp_p95, rh_med, tvoc_med, tvoc_amp,
        batt_med, sample_count, excluded_count, sensor_epoch)
     SELECT node_id,
            t_utc_ms / 86400000 AS day,
            MIN(temp_c100), CAST(AVG(temp_c100) AS INTEGER), MAX(temp_c100),
            CAST(AVG(rh_x100) AS INTEGER),
            CAST(AVG(CASE WHEN gas_status = 0 THEN tvoc_ppb END) AS INTEGER),
            MAX(CASE WHEN gas_status = 0 THEN tvoc_ppb END)
              - MIN(CASE WHEN gas_status = 0 THEN tvoc_ppb END),
            CAST(AVG(batt_mv) AS INTEGER),
            SUM(CASE WHEN gas_status = 0 OR gas_status IS NULL THEN 1 ELSE 0 END),
            SUM(CASE WHEN gas_status IS NOT NULL AND gas_status != 0 THEN 1 ELSE 0 END),
            sensor_epoch
       FROM leitura_hora
      WHERE node_id = ? AND t_utc_ms IS NOT NULL
      GROUP BY node_id, day, sensor_epoch
     HAVING SUM(CASE WHEN gas_status = 0 OR gas_status IS NULL THEN 1 ELSE 0 END) > 0`,
    [nodeId],
  );
}

/** Registra a sessão de coleta, inclusive quando ela falha (FR-010). */
export function registrarSessao(
  db: SqlDb,
  nodeId: number,
  dados: {
    startedMs: number; endedMs: number; protoVer: number | null;
    recordCount: number; outcome: string; src: string;
  },
): void {
  db.run(
    `INSERT INTO pull_session
      (node_id, started_ms, ended_ms, proto_ver, record_count, outcome, src)
     VALUES (?,?,?,?,?,?,?)`,
    [nodeId, dados.startedMs, dados.endedMs, dados.protoVer,
     dados.recordCount, dados.outcome, dados.src],
  );
}
