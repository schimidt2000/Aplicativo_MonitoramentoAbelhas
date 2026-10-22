/**
 * A hora das leituras no banco (feature 003). Carrega o que o nó mediu e as
 * referências, chama a avaliação pura de `core/hora`, e grava o resultado como
 * uma VERSÃO DE HORAS à parte. A tabela `reading` nunca é tocada aqui
 * (Princípio III): a hora que vale é a da VIEW `leitura_hora`.
 *
 * Nenhuma função daqui abre transação, exceto `atualizarHoras`: elas rodam
 * dentro da transação de quem chama (a migração, a coleta, a resposta do
 * apicultor), e o driver do navegador não aceita transação dentro de transação.
 */
import {
  avaliarHoras, discordantesDe,
  type AvaliacaoDasHoras, type EstadoReferencia, type Faixa, type LeituraDeTempo,
  type ModoRelogio, type OrigemReferencia, type Referencia,
} from '@/core/hora';
import { INICIO_DO_PROJETO_MS } from '@/core/relogio';
import { recalcularResumosSemTransacao } from './ingest';
import type { SqlDb } from './types';

export type CausaDaVersao =
  | 'coleta' | 'confirmacao' | 'instalacao-003' | 'semente'
  /** Feature 005: o apicultor mudou o intervalo da placa no cadastro (FR-019). */
  | 'intervalo';

/* ---------- Referências ---------- */

export interface NovaReferencia {
  origem: OrigemReferencia;
  /** Id da referência de coleta da mesma visita. Omitido: é ela mesma. */
  grupo?: number;
  bootId: string | null;
  ligada: number | null;
  tNode: number;
  tUtcMs: number;
  monoMs: number;
  rttMs: number;
  src: string;
  /** Hora do celular plausível e nó com noção de tempo. */
  aceita: boolean;
  seqRef: number | null;
  modo: ModoRelogio | null;
  /** Período de medição que o nó informou na sessão (`NodeInfo.samplePeriodS`). */
  periodoS?: number | null;
  criadoMs: number;
}

/** Grava a referência e devolve o id dela. Toda coleta grava a sua (FR-012). */
export function gravarReferencia(db: SqlDb, nodeId: number, r: NovaReferencia): number {
  db.run(
    `INSERT INTO clock_anchor
       (node_id, boot_id, t_node, t_utc_ms, mono_ms, rtt_ms, src, trusted,
        origem, grupo, boot_no, seq_ref, clock_mode, periodo_s, criado_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nodeId, r.bootId ?? '', r.tNode, r.tUtcMs, r.monoMs, r.rttMs, r.src, r.aceita ? 1 : 0,
     r.origem, r.grupo ?? null, r.ligada, r.seqRef, r.modo, r.periodoS ?? null, r.criadoMs],
  );
  return db.all<{ id: number }>('SELECT last_insert_rowid() AS id')[0].id;
}

interface LinhaReferencia {
  id: number; grupo: number; t_node: number; t_utc_ms: number; boot_no: number | null;
  seq_ref: number | null; clock_mode: ModoRelogio | null; origem: OrigemReferencia;
  periodo_s: number | null; trusted: number; revogada: number; confirmada: number;
}

export function carregarReferencias(db: SqlDb, nodeId: number): Referencia[] {
  return db.all<LinhaReferencia>(
    `SELECT a.id, COALESCE(a.grupo, a.id) AS grupo, a.t_node, a.t_utc_ms, a.boot_no,
            a.seq_ref, a.clock_mode, a.origem, a.periodo_s, a.trusted,
            EXISTS (SELECT 1 FROM referencia_revogada rv WHERE rv.ref_id = a.id) AS revogada,
            EXISTS (SELECT 1 FROM hora_decisao d
                      JOIN clock_anchor g ON g.id = d.ref_id
                     WHERE d.resposta = 'sim'
                       AND COALESCE(g.grupo, g.id) = COALESCE(a.grupo, a.id)) AS confirmada
       FROM clock_anchor a
      WHERE a.node_id = ?
      ORDER BY a.id`,
    [nodeId],
  ).map((l) => ({
    id: l.id, grupo: l.grupo, tNode: l.t_node, tUtcMs: l.t_utc_ms, ligada: l.boot_no,
    seqRef: l.seq_ref, modo: l.clock_mode, origem: l.origem, periodoS: l.periodo_s,
    aceita: l.trusted === 1,
    revogada: l.revogada === 1, confirmada: l.confirmada === 1,
  }));
}

/** Só as quatro colunas que a avaliação usa: cabe na memória de um aparelho de 2 GB. */
export function carregarLeiturasDeTempo(db: SqlDb, nodeId: number): LeituraDeTempo[] {
  return db.all<LeituraDeTempo>(
    `SELECT seq, t_node AS tNode, boot_no AS ligada, clock_mode AS modo
       FROM reading WHERE node_id = ? ORDER BY seq`,
    [nodeId],
  );
}

function periodoDoNo(db: SqlDb, nodeId: number): number {
  return db.all<{ p: number | null }>(
    'SELECT period_s AS p FROM node WHERE node_id = ?', [nodeId],
  )[0]?.p ?? 900;
}

/**
 * Intervalo da placa no cadastro (feature 005), ou undefined para o padrão.
 * A coluna nasce na migração 3: quem chama só pergunta quando há leitura ou
 * referência em contagem, que só existem a partir dela (D-518) — a migração 2
 * roda este mesmo código num banco que ainda não tem a coluna.
 */
function intervaloDaPlaca(db: SqlDb, nodeId: number): number | undefined {
  const v = db.all<{ s: number | null }>(
    'SELECT intervalo_medicao_s AS s FROM node WHERE node_id = ?', [nodeId],
  )[0]?.s ?? null;
  return v !== null && v > 0 ? v : undefined;
}

export function avaliarNo(
  db: SqlDb, nodeId: number, ajustar?: (refs: Referencia[]) => Referencia[],
): AvaliacaoDasHoras {
  const refs = carregarReferencias(db, nodeId);
  const leituras = carregarLeiturasDeTempo(db, nodeId);
  const temContagem = leituras.some((l) => l.modo === 'contagem')
    || refs.some((r) => r.modo === 'contagem');
  return avaliarHoras(
    leituras,
    ajustar ? ajustar(refs) : refs,
    {
      periodoS: periodoDoNo(db, nodeId), inicioDoProjetoMs: INICIO_DO_PROJETO_MS,
      intervaloContagemS: temContagem ? intervaloDaPlaca(db, nodeId) : undefined,
    },
  );
}

/* ---------- Versões de horas ---------- */

interface LinhaFaixa {
  seq_ini: number; seq_fim: number; ligada: number | null; ref_id: number | null;
  ref_t_node: number; ref_t_utc_ms: number | null; t_quality: number; motivo: string | null;
  /** Da migração 3 em diante. Antes dela a coluna não existe e isto vem undefined. */
  ms_por_unidade?: number | null;
}

function faixasDaUltimaVersao(db: SqlDb, nodeId: number): LinhaFaixa[] | null {
  const v = db.all<{ id: number | null }>(
    'SELECT MAX(id) AS id FROM hora_versao WHERE node_id = ?', [nodeId],
  )[0]?.id ?? null;
  if (v === null) return null;
  // `*` e não a lista: durante a migração 2 a coluna da 3 ainda não existe (D-518).
  return db.all<LinhaFaixa>(
    'SELECT * FROM hora_correcao WHERE versao_id = ? ORDER BY seq_ini',
    [v],
  );
}

function mesmasFaixas(antes: LinhaFaixa[] | null, agora: Faixa[]): boolean {
  if (antes === null || antes.length !== agora.length) return false;
  return agora.every((f, i) => {
    const a = antes[i];
    return a.seq_ini === f.seqIni && a.seq_fim === f.seqFim && a.ligada === f.ligada
      && a.ref_id === f.refId && a.ref_t_node === f.refTNode
      && a.ref_t_utc_ms === f.refTUtcMs && a.t_quality === f.qualidade
      && a.motivo === f.motivo && (a.ms_por_unidade ?? null) === (f.msPorUnidade ?? null);
  });
}

/**
 * Avalia o nó e, se a hora de alguma leitura mudou, grava uma versão nova e
 * refaz os resumos diários. Não abre transação.
 */
export function gravarAvaliacao(
  db: SqlDb, nodeId: number, causa: CausaDaVersao, agoraMs: number,
): { avaliacao: AvaliacaoDasHoras; mudou: boolean } {
  const avaliacao = avaliarNo(db, nodeId);
  if (mesmasFaixas(faixasDaUltimaVersao(db, nodeId), avaliacao.faixas)) {
    return { avaliacao, mudou: false };
  }
  db.run(
    'INSERT INTO hora_versao (node_id, criado_ms, causa) VALUES (?, ?, ?)',
    [nodeId, agoraMs, causa],
  );
  const versaoId = db.all<{ id: number }>('SELECT last_insert_rowid() AS id')[0].id;
  // Um INSERT por bloco: uma versão tem poucas faixas (uma por referência por ligada).
  // A coluna da migração 3 só entra quando alguma faixa a usa (só a contagem, que
  // não existe antes dela): a migração 2 roda este código sem a coluna (D-518).
  const comUnidade = avaliacao.faixas.some((f) => f.msPorUnidade !== undefined);
  const POR_INSERT = 50;
  for (let i = 0; i < avaliacao.faixas.length; i += POR_INSERT) {
    const bloco = avaliacao.faixas.slice(i, i + POR_INSERT);
    const params: unknown[] = [];
    for (const f of bloco) {
      params.push(versaoId, nodeId, f.seqIni, f.seqFim, f.ligada, f.refId,
        f.refTNode, f.refTUtcMs, f.qualidade, f.motivo);
      if (comUnidade) params.push(f.msPorUnidade ?? null);
    }
    const n = comUnidade ? 11 : 10;
    db.run(
      `INSERT INTO hora_correcao
         (versao_id, node_id, seq_ini, seq_fim, ligada, ref_id, ref_t_node,
          ref_t_utc_ms, t_quality, motivo${comUnidade ? ', ms_por_unidade' : ''})
       VALUES ${bloco.map(() => `(${new Array(n).fill('?').join(',')})`).join(',')}`,
      params,
    );
  }
  recalcularResumosSemTransacao(db, nodeId);
  return { avaliacao, mudou: true };
}

/** `gravarAvaliacao` numa transação própria. */
export function atualizarHoras(
  db: SqlDb, nodeId: number, causa: CausaDaVersao, agoraMs = Date.now(),
): AvaliacaoDasHoras {
  let r: AvaliacaoDasHoras | null = null;
  db.transaction(() => { r = gravarAvaliacao(db, nodeId, causa, agoraMs).avaliacao; });
  return r as unknown as AvaliacaoDasHoras;
}

/** FR-015: todos os nós com leitura ou referência. Roda dentro da migração. */
export function reavaliarTodos(db: SqlDb, causa: CausaDaVersao, agoraMs = Date.now()): void {
  const nos = db.all<{ node_id: number }>(
    `SELECT node_id FROM reading GROUP BY node_id
     UNION SELECT node_id FROM clock_anchor GROUP BY node_id`,
  );
  for (const { node_id } of nos) gravarAvaliacao(db, node_id, causa, agoraMs);
}

/* ---------- Conflito de hora (FR-009 a FR-011) ---------- */

export function estadoDaReferencia(av: AvaliacaoDasHoras, refId: number): EstadoReferencia | null {
  return av.referencias.get(refId)?.estado ?? null;
}

/**
 * ANTES da transferência: a hora desta coleta discorda das referências que já
 * existem? A leitura `seqRef` ainda não chegou; a ligada da referência nova sai
 * da hipótese pela última leitura gravada (D-307).
 */
export function haConflitoAntesDeTransferir(db: SqlDb, nodeId: number, refId: number): boolean {
  const av = avaliarNo(db, nodeId, (refs) =>
    refs.map((r) => (r.id === refId ? { ...r, provisoria: true } : r)));
  return estadoDaReferencia(av, refId) === 'em-conflito';
}

export type Resposta = 'sim' | 'nao';

export function grupoDaReferencia(db: SqlDb, refId: number): number {
  return db.all<{ g: number }>(
    'SELECT COALESCE(grupo, id) AS g FROM clock_anchor WHERE id = ?', [refId],
  )[0]?.g ?? refId;
}

/**
 * Registra a resposta do apicultor (FR-011). "Sim" revoga as referências que
 * discordam da desta coleta e grava uma versão nova de horas; "Não" só fica
 * registrado. Não abre transação. Devolve quantas referências foram revogadas.
 */
export function registrarResposta(
  db: SqlDb, nodeId: number, refId: number, resposta: Resposta,
  horaCelularMs: number, agoraMs: number,
): number {
  db.run(
    `INSERT INTO hora_decisao (node_id, ref_id, resposta, hora_celular_ms, decidido_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [nodeId, refId, resposta, horaCelularMs, agoraMs],
  );
  if (resposta === 'nao') return 0;

  const decisaoId = db.all<{ id: number }>('SELECT last_insert_rowid() AS id')[0].id;
  const refs = carregarReferencias(db, nodeId);
  const grupoDe = new Map(refs.map((r) => [r.id, r.grupo]));
  const g = (id: number) => grupoDe.get(id) ?? id;
  const av = avaliarNo(db, nodeId);
  // Revoga o grupo inteiro de cada discordante: coleta e acerto da mesma visita
  // usaram a mesma hora do celular, e caem juntos.
  const grupos = new Set(discordantesDe(av, g, refId).map(g));
  const revogar = refs.filter((r) => grupos.has(r.grupo) && !r.revogada).map((r) => r.id);
  for (const id of revogar) {
    db.run(
      `INSERT OR IGNORE INTO referencia_revogada (ref_id, revogada_ms, motivo, decisao_id)
       VALUES (?, ?, 'apicultor-confirmou-a-data', ?)`,
      [id, agoraMs, decisaoId],
    );
  }
  gravarAvaliacao(db, nodeId, 'confirmacao', agoraMs);
  return revogar.length;
}

/* ---------- Consultas para a tela ---------- */

/** Leituras sem hora conhecida: ficam fora de gráfico e resumo, e são contadas (FR-017). */
export function contarSemHora(db: SqlDb, nodeId: number): number {
  return db.all<{ c: number }>(
    'SELECT COUNT(*) AS c FROM leitura_hora WHERE node_id = ? AND t_utc_ms IS NULL',
    [nodeId],
  )[0]?.c ?? 0;
}

export interface ContagemPorQualidade {
  ancorada: number; estimada: number; desconhecida: number; rtc: number; total: number;
}

/** As contagens que o cabeçalho da planilha precisa trazer (FR-018). */
export function contarPorQualidade(db: SqlDb, nodeId: number): ContagemPorQualidade {
  const linhas = db.all<{ q: number; c: number }>(
    'SELECT t_quality AS q, COUNT(*) AS c FROM leitura_hora WHERE node_id = ? GROUP BY t_quality',
    [nodeId],
  );
  const c: ContagemPorQualidade = { ancorada: 0, estimada: 0, desconhecida: 0, rtc: 0, total: 0 };
  for (const l of linhas) {
    if (l.q === 0) c.rtc += l.c;
    else if (l.q === 1) c.ancorada += l.c;
    else if (l.q === 2) c.estimada += l.c;
    else c.desconhecida += l.c;
    c.total += l.c;
  }
  return c;
}

/* ---------- Intervalo da placa (feature 005, FR-019) ---------- */

/**
 * Muda o intervalo da placa no cadastro e recalcula as horas por versão nova.
 * Nenhuma leitura muda (INV-506). `null` volta ao padrão de 7200 s.
 * Abre a própria transação.
 */
export function definirIntervaloDaPlaca(
  db: SqlDb, nodeId: number, intervaloS: number | null, agoraMs = Date.now(),
): void {
  if (intervaloS !== null && !(Number.isInteger(intervaloS) && intervaloS > 0)) {
    throw new Error(`Intervalo inválido: ${intervaloS}`);
  }
  db.transaction(() => {
    db.run('UPDATE node SET intervalo_medicao_s = ? WHERE node_id = ?', [intervaloS, nodeId]);
    gravarAvaliacao(db, nodeId, 'intervalo', agoraMs);
  });
}

/** O intervalo que vale para o nó: o do cadastro, ou o padrão. */
export function intervaloDaPlacaOuPadrao(db: SqlDb, nodeId: number, padraoS: number): number {
  return intervaloDaPlaca(db, nodeId) ?? padraoS;
}
