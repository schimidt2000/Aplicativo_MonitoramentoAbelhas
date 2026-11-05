/**
 * Voláteis relativos ao normal da própria colmeia (feature 007). Puro.
 *
 * O sensor de gás (ENS160, MOX) não dá um número que se compare entre colmeias
 * nem que tenha sentido absoluto: só a mudança DENTRO da mesma colmeia diz
 * alguma coisa (CLAUDE.md, Non-negotiables; specs/007-volateis-relativos).
 *
 * O normal é a mediana das médias diárias dos 14 dias ANTERIORES ao dia de
 * referência — o dia da última leitura da colmeia, que pode estar incompleto —,
 * só com dias que têm média, e a média do dia já é só de leituras boas do
 * sensor de gás (regra da 001). Pelo menos 3 dias (D-702). Assim a colmeia que
 * não é coletada há semanas compara a última leitura com os dias que vieram
 * antes dela, e não com um vazio.
 */

export const JANELA_DO_NORMAL_DIAS = 14;
export const MINIMO_DE_DIAS = 3;
/** A partir desta diferença, "acima" ou "abaixo". PROVISÓRIO (D-703). */
export const LIMIAR_PERCENTUAL = 50;

export interface DiaDeVolateis {
  /** Dia em UTC, contado desde 1970 (o `day` de `reading_daily`). */
  day: number;
  /** Média do dia, em ppb, só de leituras boas; null quando não houve. */
  tvoc_med: number | null;
}

export interface NormalDaColmeia {
  /** Mediana, em ppb. null enquanto o app aprende. */
  ppb: number | null;
  /** Quantos dias de leitura boa entraram (ou há, se ainda não basta). */
  dias: number;
}

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function normalDaColmeia(dias: DiaDeVolateis[], referencia: number): NormalDaColmeia {
  const valores = dias
    .filter((d) => d.day < referencia && d.day >= referencia - JANELA_DO_NORMAL_DIAS)
    .map((d) => d.tvoc_med)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (valores.length < MINIMO_DE_DIAS) return { ppb: null, dias: valores.length };
  const m = mediana(valores);
  // Normal zero não divide: o app segue aprendendo (spec, Edge Cases).
  return { ppb: m > 0 ? m : null, dias: valores.length };
}

/** Diferença em % do normal, arredondada. null sem valor ou sem normal. */
export function percentualDoNormal(ppb: number | null, normal: NormalDaColmeia): number | null {
  if (ppb === null || !Number.isFinite(ppb) || normal.ppb === null) return null;
  return Math.round((ppb / normal.ppb - 1) * 100) + 0;
}

export type EstadoDosVolateis =
  | { estado: 'sem-valor' }
  | { estado: 'aprendendo'; dias: number }
  | { estado: 'normal'; percentual: number }
  | { estado: 'acima'; percentual: number }
  | { estado: 'abaixo'; percentual: number };

export function classificarVolateis(ppb: number | null, normal: NormalDaColmeia): EstadoDosVolateis {
  if (ppb === null || !Number.isFinite(ppb)) return { estado: 'sem-valor' };
  const p = percentualDoNormal(ppb, normal);
  if (p === null) return { estado: 'aprendendo', dias: normal.dias };
  if (p >= LIMIAR_PERCENTUAL) return { estado: 'acima', percentual: p };
  if (p <= -LIMIAR_PERCENTUAL) return { estado: 'abaixo', percentual: p };
  return { estado: 'normal', percentual: p };
}

/** O dia de referência do normal: o da última leitura com hora, ou hoje. */
export function diaDeReferencia(ultimaMs: number | null, agoraMs: number): number {
  return Math.floor((ultimaMs ?? agoraMs) / 86_400_000);
}
