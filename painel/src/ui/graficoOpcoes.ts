/**
 * Opções e dados do uPlot, separados do componente para serem testados.
 *
 * LACUNA É LACUNA (FR-027, SC-008): o construtor por calendário põe `null` no
 * dia sem linha, mas quem decide se o `null` vira falha na linha é o uPlot.
 * `spanGaps: false` em TODA série é o que impede o desenho de ligar os dois
 * lados da lacuna; `tests/grafico.test.ts` trava isso. Os pontos ficam sempre
 * visíveis para que um dia isolado entre duas lacunas não desapareça.
 */
import type uPlot from 'uplot';
import { fmtDia } from '../dominio/formato';
import { t } from '../textos';

export interface SerieGrafico {
  rotulo: string;
  y: (number | null)[];
  cor: string;
  tracejado?: boolean;
}

export const SEG_DIA = 86_400;

const vazio = (v: number | null | undefined) => v === null || v === undefined;

/** Séries do uPlot: a primeira é o eixo dos dias; as outras, uma por série. */
export function seriesUplot(series: SerieGrafico[], formatoY: (v: number) => string): uPlot.Series[] {
  return [
    {
      label: t('grafico.dia'),
      value: (_u, v) => (vazio(v) ? '—' : fmtDia(Math.floor(v / SEG_DIA))),
    },
    ...series.map((s): uPlot.Series => ({
      label: s.rotulo,
      stroke: s.cor,
      width: s.tracejado ? 1.5 : 2.5,
      dash: s.tracejado ? [6, 4] : undefined,
      spanGaps: false,
      points: { show: true, size: s.tracejado ? 3 : 5, stroke: s.cor, fill: s.cor },
      value: (_u: uPlot, v: number | null) => (vazio(v) ? '—' : formatoY(v as number)),
    })),
  ];
}

/** Dados alinhados: dias em segundos UTC e cada série como veio (null fica null). */
export function dadosUplot(dias: number[], series: SerieGrafico[]): uPlot.AlignedData {
  return [dias.map((d) => d * SEG_DIA), ...series.map((s) => s.y)];
}
