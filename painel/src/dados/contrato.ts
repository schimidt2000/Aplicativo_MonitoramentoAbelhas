/**
 * Contrato com o esquema do servidor: o ÚNICO arquivo do painel que conhece
 * nome de tabela, de view e de coluna. Alinhar o painel com `servidor/*.sql`
 * é mexer só aqui.
 *
 * Situação em 2026-10-21, na integração (ver specs/002-envio-e-painel/painel-notas.md
 * e specs/002-envio-e-painel/contracts/servidor.md):
 *  - ALINHADO com as visões que o servidor publica para o painel, todas
 *    `security_invoker` (a RLS da pesquisadora vale): `hive_overview` (uma
 *    linha por colmeia, mesmas colunas de `LinhaMacro`), `hive_daily` (resumos
 *    por nó, dia e época) e `hive_reading` (leituras da planilha). A suposição
 *    anterior, `vw_macro`, nunca existiu no servidor. `node` continua lido
 *    direto (política `researcher_reads_node`), para achar os nós da colmeia.
 *    Colmeia é chave composta (beekeeper_id, id), porque o id da colmeia é
 *    local do celular e se repete entre apicultores.
 *  - CONFERIDO contra a feature 003 (`src/core/hora/tipos.ts` do celular):
 *    `t_quality` 0 = rtc, 1 = ancorada, 2 = estimada, 3 = desconhecida. O nó
 *    não tem relógio próprio (firmware, 2026-10-14), então 0 não chega hoje;
 *    se chegar, vira "desconhecida" (errar para "sem hora" é aceitável, errar
 *    para "hora certa" não é — spec 003).
 */
import type {
  ColmeiaMacro, Criacao, LeituraPainel, MotivoProblema, QualidadeHora, ResumoDiario,
} from './porta';

export const TABELAS = {
  visaoMacro: 'hive_overview',
  resumoDiario: 'hive_daily',
  leitura: 'hive_reading',
  no: 'node',
} as const;

/** Uma linha de `hive_overview`: uma colmeia, com contagens já somadas no servidor. */
export interface LinhaMacro {
  beekeeper_id: string;
  hive_id: string;
  hive_name: string;
  beekeeper_name: string;
  apiary_name: string;
  species: string | null;
  municipality: string | null;
  state: string | null;
  last_reading_ms: number | null;
  reading_count: number | null;
  excluded_count: number | null;
}

export const COLUNAS_MACRO =
  'beekeeper_id,hive_id,hive_name,beekeeper_name,apiary_name,species,municipality,state,last_reading_ms,reading_count,excluded_count';

export interface LinhaNo {
  device_id: string;
  beekeeper_id: string;
  hive_id: string | null;
  temp_offset_c100: number;
}

export const COLUNAS_NO = 'device_id,beekeeper_id,hive_id,temp_offset_c100';

export interface LinhaResumo {
  device_id: string;
  day: number;
  sensor_epoch: number;
  temp_p5: number | null;
  temp_med: number | null;
  temp_p95: number | null;
  rh_med: number | null;
  tvoc_med: number | null;
  sample_count: number;
  excluded_count: number;
}

export const COLUNAS_RESUMO =
  'device_id,day,sensor_epoch,temp_p5,temp_med,temp_p95,rh_med,tvoc_med,sample_count,excluded_count';

export interface LinhaLeitura {
  device_id: string;
  seq: number;
  t_utc_ms: number | null;
  t_quality: number;
  temp_c100: number | null;
  rh_x100: number | null;
  tvoc_ppb: number | null;
  eco2_ppm: number | null;
  gas_status: number | null;
  sensor_epoch: number;
  proto_ver: number;
}

export const COLUNAS_LEITURA =
  'device_id,seq,t_utc_ms,t_quality,temp_c100,rh_x100,tvoc_ppb,eco2_ppm,gas_status,sensor_epoch,proto_ver';

/**
 * Identificador da colmeia no painel. Composto, porque no servidor a chave é
 * (beekeeper_id, id). Vai no endereço da tela da colmeia: são dois códigos
 * opacos, nenhum nome de pessoa (FR-033).
 */
const SEP = '~';

export function idColmeia(beekeeperId: string, hiveId: string): string {
  return `${beekeeperId}${SEP}${hiveId}`;
}

export function partesColmeia(colmeiaId: string): { beekeeperId: string; hiveId: string } | null {
  const i = colmeiaId.indexOf(SEP);
  if (i <= 0 || i === colmeiaId.length - 1) return null;
  return { beekeeperId: colmeiaId.slice(0, i), hiveId: colmeiaId.slice(i + 1) };
}

/** Texto livre de espécie do cadastro -> criação. null quando não dá para saber. */
export function criacaoDeEspecie(especie: string | null): Criacao | null {
  if (!especie) return null;
  const s = especie.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/apis|mellifera|africanizada|europa/.test(s)) return 'apis';
  if (/melipon|sem ferrao|jandaira|jatai|urucu|mandacaia|tiuba|moca-branca|scaptotrigona|tetragonisca|plebeia|frieseomelitta|canudo|munduri/.test(s)) {
    return 'meliponineo';
  }
  return null;
}

export function qualidadeDeCodigo(codigo: number | null, tUtcMs: number | null): QualidadeHora {
  if (tUtcMs === null) return 'desconhecida';
  if (codigo === 1) return 'ancorada';
  if (codigo === 2) return 'estimada';
  return 'desconhecida';
}

export function macroDeLinha(l: LinhaMacro): ColmeiaMacro {
  return {
    colmeiaId: idColmeia(l.beekeeper_id, l.hive_id),
    colmeiaNome: l.hive_name,
    apicultorNome: l.beekeeper_name,
    localNome: l.apiary_name,
    criacao: criacaoDeEspecie(l.species),
    municipio: l.municipality,
    uf: l.state,
    ultimaLeituraMs: l.last_reading_ms === null ? null : Number(l.last_reading_ms),
    leituras: Number(l.reading_count ?? 0),
    excluidas: Number(l.excluded_count ?? 0),
  };
}

export function resumoDeLinha(l: LinhaResumo): ResumoDiario {
  return {
    noId: l.device_id,
    dia: l.day,
    epocaSensor: l.sensor_epoch,
    tempMinC100: l.temp_p5,
    tempMedC100: l.temp_med,
    tempMaxC100: l.temp_p95,
    umidMedX100: l.rh_med,
    tvocMedPpb: l.tvoc_med,
    validas: l.sample_count,
    excluidas: l.excluded_count,
  };
}

export function leituraDeLinha(l: LinhaLeitura, colmeiaId: string): LeituraPainel {
  // bigint do Postgres chega como número pelo PostgREST; Number() protege do texto.
  const tUtcMs = l.t_utc_ms === null ? null : Number(l.t_utc_ms);
  return {
    colmeiaId,
    noId: l.device_id,
    seq: Number(l.seq),
    tUtcMs,
    qualidadeHora: qualidadeDeCodigo(l.t_quality, tUtcMs),
    epocaSensor: l.sensor_epoch,
    versaoFormato: l.proto_ver,
    tempC100: l.temp_c100,
    umidX100: l.rh_x100,
    tvocPpb: l.tvoc_ppb,
    eco2Ppm: l.eco2_ppm,
    situacaoGas: l.gas_status,
  };
}

/**
 * Classifica um problema vindo do supabase-js ou do navegador. Sem rede não é
 * erro do servidor, e a tela diz coisas diferentes para cada um.
 */
export function motivoDoProblema(e: unknown, online: boolean): MotivoProblema {
  if (!online) return 'sem-internet';
  const texto = e instanceof Error ? `${e.name} ${e.message}` : String(
    (e as { message?: unknown } | null)?.message ?? e,
  );
  if (/failed to fetch|networkerror|network request failed|fetch failed|load failed|retryablefetcherror/i.test(texto)) {
    return 'sem-internet';
  }
  return 'servidor';
}
