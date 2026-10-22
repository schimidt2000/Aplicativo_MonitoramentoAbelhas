/**
 * Gráfico diário com uPlot (a única biblioteca de gráfico permitida no painel,
 * `.claude/rules/ui.md`).
 *
 * LACUNA É LACUNA: `spanGaps: false` em toda série, e a série vem do
 * construtor por calendário (`dominio/serie.ts`), em que dia ausente é `null`.
 * Cada trilha (nó sensor + época) é uma série separada, então nenhuma linha
 * atravessa a troca de sensor. Os pontos ficam sempre visíveis para que um dia
 * isolado entre duas lacunas não desapareça.
 *
 * Eixo do tempo em UTC, como os dias do resumo.
 */
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { fmtDia } from '../dominio/formato';
import { SEG_DIA, dadosUplot, seriesUplot, type SerieGrafico } from './graficoOpcoes';

export type { SerieGrafico };

interface Props {
  titulo: string;
  subtitulo?: string;
  dias: number[];
  series: SerieGrafico[];
  formatoY: (v: number) => string;
  onDia: (indice: number | null) => void;
}

const ALTURA = 260;
/** Fonte do sistema, nunca fonte web (`.claude/rules/ui.md`). */
const FONTE = '14px system-ui, sans-serif';

export function Grafico({ titulo, subtitulo, dias, series, formatoY, onDia }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const aoDia = useRef(onDia);
  aoDia.current = onDia;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const opcoes: uPlot.Options = {
      width: Math.max(320, el.clientWidth),
      height: ALTURA,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
      scales: { x: { time: true } },
      legend: { live: false },
      // Os gráficos da mesma tela apontam o mesmo dia ao mesmo tempo.
      cursor: { drag: { x: false, y: false }, sync: { key: 'colmeia' } },
      axes: [
        {
          stroke: '#111111',
          font: FONTE,
          grid: { stroke: '#e1e1e1' },
          // Marcas só em dias inteiros: o resumo é diário, hora não faz sentido aqui.
          incrs: [1, 2, 7, 14, 30, 61, 91, 182, 365].map((d) => d * SEG_DIA),
          values: (_u, ticks) => ticks.map((s) => fmtDia(Math.floor(s / SEG_DIA)).slice(0, 5)),
        },
        {
          stroke: '#111111',
          font: FONTE,
          grid: { stroke: '#e1e1e1' },
          size: 64,
          values: (_u, ticks) => ticks.map((v) => formatoY(v)),
        },
      ],
      series: seriesUplot(series, formatoY),
      hooks: {
        setCursor: [(u) => aoDia.current(u.cursor.idx ?? null)],
      },
    };
    const dados = dadosUplot(dias, series);
    const grafico = new uPlot(opcoes, dados, el);

    const observador = new ResizeObserver(() => {
      grafico.setSize({ width: Math.max(320, el.clientWidth), height: ALTURA });
    });
    observador.observe(el);
    return () => {
      observador.disconnect();
      grafico.destroy();
    };
  }, [dias, series, formatoY]);

  return (
    <section className="grafico">
      <h3>{titulo}</h3>
      {subtitulo ? <p className="subtitulo">{subtitulo}</p> : null}
      <div className="grafico-area" ref={area} onMouseLeave={() => aoDia.current(null)} />
    </section>
  );
}
