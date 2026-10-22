/**
 * Módulo único de acesso a dados. O mesmo SQL roda nos três drivers.
 * Regras vinculantes (Princípio III): nunca UPDATE nem DELETE em `reading`.
 *
 * Toda consulta de SÉRIE (o que tem hora) lê da VIEW `leitura_hora`, que traz a
 * hora efetiva, já com as correções da feature 003. Ler `reading.t_utc_ms`
 * direto daria a hora do instante da gravação — em branco nas leituras novas.
 */
import type { SqlDb } from './types';
import type { CadastroParaEnvio, LeituraParaEnvio } from '@/core/ports/nuvem';

export interface LinhaColmeia {
  hive_id: string;
  nome: string;
  node_id: number | null;
  device_id: string | null;
  ultima_ms: number | null;
  total: number;
  pendentes: number;
  temp_c100: number | null;
  rh_x100: number | null;
  tvoc_ppb: number | null;
  batt_mv: number | null;
  temp_offset_c100: number;
  /** Desfecho da última sessão de coleta ('ok', 'parcial'...). NULL se nunca houve. */
  ultimo_resultado: string | null;
}

export interface LinhaDiaria {
  day: number;
  temp_p5: number | null;
  temp_med: number | null;
  temp_p95: number | null;
  rh_med: number | null;
  tvoc_med: number | null;
  batt_med: number | null;
  sample_count: number;
  excluded_count: number;
}

export function listarColmeias(db: SqlDb): LinhaColmeia[] {
  // "Última leitura" é a mais recente COM hora conhecida (FR-017): uma leitura
  // sem hora não pode dizer há quanto tempo a colmeia foi medida. "Mais
  // recente" pelo número da leitura, que só cresce: a busca anda de trás para
  // a frente na chave e para na primeira com hora, sem calcular a hora de todas.
  return db.all<LinhaColmeia>(`
    SELECT h.id AS hive_id, h.nome,
           n.node_id, n.device_id, COALESCE(n.temp_offset_c100, 0) AS temp_offset_c100,
           u.t_utc_ms AS ultima_ms, u.temp_c100, u.rh_x100, u.tvoc_ppb, u.batt_mv,
           COALESCE(c.total, 0) AS total,
           COALESCE(c.pendentes, 0) AS pendentes,
           (SELECT ps.outcome FROM pull_session ps
             WHERE ps.node_id = n.node_id
             ORDER BY ps.id DESC LIMIT 1) AS ultimo_resultado
      FROM hive h
      LEFT JOIN node n ON n.hive_id = h.id
      LEFT JOIN (
        SELECT node_id, COUNT(*) AS total,
               SUM(CASE WHEN synced_at IS NULL THEN 1 ELSE 0 END) AS pendentes
          FROM reading GROUP BY node_id
      ) c ON c.node_id = n.node_id
      LEFT JOIN leitura_hora u
        ON u.node_id = n.node_id
       AND u.seq = (SELECT lh.seq FROM leitura_hora lh
                     WHERE lh.node_id = n.node_id AND lh.t_utc_ms IS NOT NULL
                     ORDER BY lh.seq DESC LIMIT 1)
     WHERE h.deleted_ms IS NULL
     ORDER BY h.nome
  `);
}

export function obterColmeia(db: SqlDb, hiveId: string): LinhaColmeia | null {
  return listarColmeias(db).find((c) => c.hive_id === hiveId) ?? null;
}

export function resumosDiarios(db: SqlDb, nodeId: number, dias: number): LinhaDiaria[] {
  const hoje = Math.floor(Date.now() / 86400000);
  return db.all<LinhaDiaria>(
    `SELECT day, temp_p5, temp_med, temp_p95, rh_med, tvoc_med, batt_med,
            sample_count, excluded_count
       FROM reading_daily
      WHERE node_id = ? AND day > ?
      ORDER BY day`,
    [nodeId, hoje - dias],
  );
}

/** Último `seq` já ingerido. É o cursor de retomada (FR-002, FR-004). */
export function ultimoSeq(db: SqlDb, nodeId: number): number {
  const r = db.all<{ m: number | null }>(
    'SELECT MAX(seq) AS m FROM reading WHERE node_id = ?',
    [nodeId],
  );
  return r[0]?.m ?? 0;
}

export function contarLeituras(db: SqlDb, nodeId?: number): number {
  const r = nodeId
    ? db.all<{ c: number }>('SELECT COUNT(*) AS c FROM reading WHERE node_id = ?', [nodeId])
    : db.all<{ c: number }>('SELECT COUNT(*) AS c FROM reading');
  return r[0]?.c ?? 0;
}

export function garantirNode(db: SqlDb, deviceId: string, hiveId: string, periodoS = 900): number {
  const achado = db.all<{ node_id: number }>(
    'SELECT node_id FROM node WHERE device_id = ?',
    [deviceId],
  );
  if (achado.length) return achado[0].node_id;

  db.run(
    'INSERT INTO node (device_id, hive_id, period_s, sensor_installed_at) VALUES (?, ?, ?, ?)',
    [deviceId, hiveId, periodoS, Date.now()],
  );
  return db.all<{ node_id: number }>(
    'SELECT node_id FROM node WHERE device_id = ?',
    [deviceId],
  )[0].node_id;
}

export function garantirApiario(db: SqlDb, id: string, nome: string): void {
  db.run(
    `INSERT INTO apiary (id, nome, updated_ms) VALUES (?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [id, nome, Date.now()],
  );
}

/**
 * Nome do apiário (ou meliponário) para o cabeçalho da lista. É dado do
 * apicultor, não texto do aplicativo: vem do banco, nunca do componente.
 * Com mais de um local cadastrado, devolve o primeiro em ordem alfabética.
 */
export function nomeDoApiario(db: SqlDb): string | null {
  return db.all<{ nome: string }>(
    'SELECT nome FROM apiary WHERE deleted_ms IS NULL ORDER BY nome LIMIT 1',
  )[0]?.nome ?? null;
}

export function garantirColmeia(db: SqlDb, id: string, apiaryId: string, nome: string): void {
  db.run(
    `INSERT INTO hive (id, apiary_id, nome, updated_ms) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [id, apiaryId, nome, Date.now()],
  );
}

/**
 * Linhas para a planilha: hora EFETIVA, qualidade e motivo (FR-018). Leitura
 * sem hora conhecida vem junto, com `t_utc_ms` em branco (US3-2).
 */
export function leiturasParaExportar(db: SqlDb, nodeId: number) {
  return db.all<Record<string, number | string | null>>(
    `SELECT seq, t_node, t_utc_ms, t_quality, t_motivo, temp_c100, rh_x100,
            tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, proto_ver, src
       FROM leitura_hora WHERE node_id = ? ORDER BY seq`,
    [nodeId],
  );
}

export function contarExcluidas(db: SqlDb, nodeId: number): number {
  const r = db.all<{ c: number }>(
    'SELECT COUNT(*) AS c FROM reading WHERE node_id = ? AND gas_status IS NOT NULL AND gas_status != 0',
    [nodeId],
  );
  return r[0]?.c ?? 0;
}

/* ---------- Preferências do apicultor ---------- */

export function lerConfig(db: SqlDb, chave: string, padrao: string): string {
  const r = db.all<{ valor: string }>(
    'SELECT valor FROM config WHERE chave = ?', [chave],
  );
  return r[0]?.valor ?? padrao;
}

export function gravarConfig(db: SqlDb, chave: string, valor: string): void {
  db.run(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor],
  );
}

/** Total de leituras ainda não enviadas, em todas as colmeias. */
export function totalPendentes(db: SqlDb): number {
  const r = db.all<{ c: number }>(
    'SELECT COUNT(*) AS c FROM reading WHERE synced_at IS NULL',
  );
  return r[0]?.c ?? 0;
}

/**
 * Leitura não enviada mais antiga — alimenta "a mais antiga é de 12/03". Só
 * entre as que têm hora conhecida (MIN ignora NULL).
 */
export function pendenteMaisAntiga(db: SqlDb): number | null {
  const r = db.all<{ m: number | null }>(
    'SELECT MIN(t_utc_ms) AS m FROM leitura_hora WHERE synced_at IS NULL',
  );
  return r[0]?.m ?? null;
}

/* ---------- Fila de envio (Trilha A) ---------- */

/**
 * Próximo nó que ainda tem leitura por enviar. O envio é por nó porque
 * `marcarEnviadas` usa faixa de `seq`, que só é inequívoca dentro de um nó.
 */
export function proximoNoComPendentes(db: SqlDb): number | null {
  const r = db.all<{ node_id: number }>(
    `SELECT node_id FROM reading WHERE synced_at IS NULL
      GROUP BY node_id ORDER BY node_id LIMIT 1`,
  );
  return r[0]?.node_id ?? null;
}

/**
 * Lê o lote seguinte pelo índice parcial `ix_reading_unsynced`. O predicado
 * `synced_at IS NULL` casa exatamente com o índice, então continua varredura
 * de índice mesmo com a tabela passando de 100 mil linhas.
 *
 * Devolve `deviceId`, nunca `node_id`: o surrogate local não atravessa a fronteira.
 * A hora é a EFETIVA no momento do envio (feature 003, D-312), e pode ser NULL.
 */
export function loteNaoEnviado(
  db: SqlDb, nodeId: number, limite: number,
): LeituraParaEnvio[] {
  const linhas = db.all<Record<string, never>>(
    `SELECT n.device_id AS deviceId, r.seq, r.t_node AS tNode,
            r.t_utc_ms AS tUtcMs, r.t_quality AS tQuality,
            r.temp_c100 AS tempC100, r.rh_x100 AS rhX100,
            r.tvoc_ppb AS tvocPpb, r.eco2_ppm AS eco2Ppm, r.aqi_uba AS aqiUba,
            r.gas_status AS gasStatus, r.batt_mv AS battMv, r.flags,
            r.boot_id AS bootId, r.sensor_epoch AS sensorEpoch,
            r.calib_version AS calibVersion, r.proto_ver AS protoVer, r.src
       FROM leitura_hora r
       JOIN node n ON n.node_id = r.node_id
      WHERE r.synced_at IS NULL AND r.node_id = ?
      ORDER BY r.seq
      LIMIT ?`,
    [nodeId, limite],
  );
  return linhas as unknown as LeituraParaEnvio[];
}

/**
 * Confirma o envio de uma faixa. É o ÚNICO `UPDATE` permitido em `reading`, e
 * toca só `synced_at` — a exceção explícita do Princípio III (constituição 1.1.0).
 *
 * A faixa é segura porque o lote é sempre "os N menores `seq` ainda não
 * enviados deste nó": qualquer linha não enviada dentro de [primeiro, último]
 * teria sido selecionada junto.
 */
export function marcarEnviadas(
  db: SqlDb, nodeId: number, primeiroSeq: number, ultimoSeq: number, agoraMs: number,
): void {
  db.run(
    `UPDATE reading SET synced_at = ?
      WHERE node_id = ? AND seq BETWEEN ? AND ? AND synced_at IS NULL`,
    [agoraMs, nodeId, primeiroSeq, ultimoSeq],
  );
}

/** Cadastro alterado desde o cursor (Trilha B). Vai ANTES das leituras. */
export function cadastroAlteradoDesde(db: SqlDb, cursorMs: number): CadastroParaEnvio {
  return {
    apiarios: db.all(
      `SELECT id, nome, municipio, uf, updated_ms AS updatedMs, deleted_ms AS deletedMs
         FROM apiary WHERE updated_ms > ?`, [cursorMs],
    ) as CadastroParaEnvio['apiarios'],
    colmeias: db.all(
      `SELECT id, apiary_id AS apiarioId, nome, especie,
              instalada_em AS instaladaEm, updated_ms AS updatedMs,
              deleted_ms AS deletedMs
         FROM hive WHERE updated_ms > ?`, [cursorMs],
    ) as CadastroParaEnvio['colmeias'],
    nos: db.all(
      `SELECT device_id AS deviceId, hive_id AS colmeiaId, placement,
              period_s AS periodS, sensor_epoch AS sensorEpoch,
              calib_version AS calibVersion, temp_offset_c100 AS tempOffsetC100,
              COALESCE(last_seen_ms, 0) AS updatedMs
         FROM node`,
    ) as CadastroParaEnvio['nos'],
  };
}

/**
 * Hora da última referência de hora aceita e não revogada deste nó. A coleta
 * não usa mais isto para decidir nada (feature 003: a conferência entre coletas
 * substituiu o `voltou-no-tempo`); fica para diagnóstico.
 */
export function ultimaAncoraConfiavelMs(db: SqlDb, nodeId: number): number | null {
  const r = db.all<{ m: number | null }>(
    `SELECT MAX(t_utc_ms) AS m FROM clock_anchor a
      WHERE a.node_id = ? AND a.trusted = 1
        AND NOT EXISTS (SELECT 1 FROM referencia_revogada rv WHERE rv.ref_id = a.id)`,
    [nodeId],
  );
  return r[0]?.m ?? null;
}

/* ---------- Coleta pelo cabo (feature 005) ---------- */

/** A última colmeia escolhida em "De qual colmeia é esta placa?" (FR-020). */
export const CHAVE_ULTIMA_COLMEIA_DO_CABO = 'cabo_ultima_colmeia';

export interface NoDaPlaca {
  nodeId: number;
  deviceId: string;
  hiveId: string;
  /** O MAC já era de outra colmeia: as leituras vão para ela, não para a escolhida. */
  peloMac: boolean;
}

function idDePlaca(): string {
  let s = 'placa-';
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/**
 * O nó das leituras da placa (D-510). Não abre transação.
 *  1. MAC de um nó conhecido → esse nó, onde quer que esteja;
 *  2. senão, o nó da colmeia escolhida; sem nó, um nó novo (`placa-<16 hex>`);
 *  3. MAC novo → gravado no nó da colmeia escolhida.
 * O MAC nunca vira `device_id`: o identificador da nuvem continua o mesmo.
 */
export function noDaPlaca(db: SqlDb, hiveIdEscolhida: string, mac: string | null): NoDaPlaca {
  if (mac) {
    const n = db.all<{ node_id: number; device_id: string; hive_id: string }>(
      'SELECT node_id, device_id, hive_id FROM node WHERE mac = ?', [mac],
    )[0];
    if (n) return { nodeId: n.node_id, deviceId: n.device_id, hiveId: n.hive_id, peloMac: n.hive_id !== hiveIdEscolhida };
  }
  let n = db.all<{ node_id: number; device_id: string }>(
    'SELECT node_id, device_id FROM node WHERE hive_id = ? ORDER BY node_id LIMIT 1', [hiveIdEscolhida],
  )[0];
  if (!n) {
    const deviceId = idDePlaca();
    db.run(
      'INSERT INTO node (device_id, hive_id, period_s, sensor_installed_at) VALUES (?, ?, ?, ?)',
      [deviceId, hiveIdEscolhida, 7200, Date.now()],
    );
    n = db.all<{ node_id: number; device_id: string }>(
      'SELECT node_id, device_id FROM node WHERE device_id = ?', [deviceId],
    )[0];
  }
  // Placa nova na colmeia: o MAC passa a ser o dela.
  if (mac) db.run('UPDATE node SET mac = ? WHERE node_id = ?', [mac, n.node_id]);
  return { nodeId: n.node_id, deviceId: n.device_id, hiveId: hiveIdEscolhida, peloMac: false };
}

/** O nó da colmeia, se já existe (sem criar). */
export function noDaColmeia(db: SqlDb, hiveId: string): { nodeId: number; deviceId: string } | null {
  const n = db.all<{ node_id: number; device_id: string }>(
    'SELECT node_id, device_id FROM node WHERE hive_id = ? ORDER BY node_id LIMIT 1', [hiveId],
  )[0];
  return n ? { nodeId: n.node_id, deviceId: n.device_id } : null;
}

/** O nó já teve coleta pelo cabo? A tela da colmeia só mostra o intervalo da placa nesse caso. */
export function noTemColetaPeloCabo(db: SqlDb, nodeId: number): boolean {
  return db.all<{ c: number }>(
    "SELECT COUNT(*) AS c FROM pull_session WHERE node_id = ? AND formato IS NOT NULL", [nodeId],
  )[0].c > 0;
}

/** O intervalo da placa no cadastro, ou null (padrão). */
export function intervaloDaPlacaNoCadastro(db: SqlDb, nodeId: number): number | null {
  return db.all<{ s: number | null }>(
    'SELECT intervalo_medicao_s AS s FROM node WHERE node_id = ?', [nodeId],
  )[0]?.s ?? null;
}

export function nomeDaColmeia(db: SqlDb, hiveId: string): string | null {
  return db.all<{ nome: string }>('SELECT nome FROM hive WHERE id = ?', [hiveId])[0]?.nome ?? null;
}
