/**
 * Escolha de período da tela da colmeia.
 *
 * "7 dias" e "30 dias" terminam na ÚLTIMA LEITURA da colmeia, não em hoje: o
 * dado só chega depois da coleta e do envio, então uma colmeia coletada há
 * duas semanas mostraria um gráfico vazio se o período terminasse hoje. A tela
 * diz isso no rótulo ("até a última leitura").
 */
import { diaDeIso, msDeDia } from './calendario';

export type EscolhaPeriodo =
  | { tipo: '7' }
  | { tipo: '30' }
  | { tipo: 'livre'; deIso: string; ateIso: string };

/** Mais que isso fica pesado de desenhar e de ler; pede para estreitar. */
export const MAX_DIAS_PERIODO = 731;

export type Periodo =
  | { ok: true; deDia: number; ateDia: number }
  | { ok: false; motivo: 'sem-leitura' | 'invalido' | 'longo' };

export function resolverPeriodo(escolha: EscolhaPeriodo, ultimoDia: number | null): Periodo {
  if (escolha.tipo === 'livre') {
    const de = diaDeIso(escolha.deIso);
    const ate = diaDeIso(escolha.ateIso);
    if (de === null || ate === null || de > ate) return { ok: false, motivo: 'invalido' };
    if (ate - de + 1 > MAX_DIAS_PERIODO) return { ok: false, motivo: 'longo' };
    return { ok: true, deDia: de, ateDia: ate };
  }
  if (ultimoDia === null) return { ok: false, motivo: 'sem-leitura' };
  const n = escolha.tipo === '7' ? 7 : 30;
  return { ok: true, deDia: ultimoDia - n + 1, ateDia: ultimoDia };
}

export type Recorte =
  | { ok: true; deDia: number; ateDia: number; deMs: number; ateMs: number }
  | { ok: false };

/**
 * Recorte da planilha: os dois dias escolhidos, INCLUSIVE, como intervalo UTC
 * meio aberto [deMs, ateMs). O último dia entra inteiro: `ateMs` é a meia-noite
 * UTC do dia SEGUINTE, não a do próprio dia (que cortaria o dia final fora).
 */
export function recortePlanilha(deIso: string, ateIso: string): Recorte {
  const de = diaDeIso(deIso);
  const ate = diaDeIso(ateIso);
  if (de === null || ate === null || de > ate) return { ok: false };
  return { ok: true, deDia: de, ateDia: ate, deMs: msDeDia(de), ateMs: msDeDia(ate + 1) };
}
