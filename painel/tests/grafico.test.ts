/**
 * Opções do uPlot (FR-027, SC-008). O construtor por calendário já põe `null`
 * no dia sem linha; estes testes travam a outra metade: que o desenho não
 * ligue os dois lados do `null` e que o `null` chegue intacto ao uPlot.
 */
import { describe, expect, it } from 'vitest';
import type { ResumoDiario } from '../src/dados/porta';
import { montarSerie } from '../src/dominio/serie';
import { SEG_DIA, dadosUplot, seriesUplot, type SerieGrafico } from '../src/ui/graficoOpcoes';

function resumo(dia: number, epocaSensor = 1): ResumoDiario {
  return {
    noId: 'N1', dia, epocaSensor, tempMinC100: 3300, tempMedC100: 3400, tempMaxC100: 3500,
    umidMedX100: 6000, tvocMedPpb: 500, validas: 96, excluidas: 0,
  };
}

const fmt = (v: number) => String(v);

describe('opções do gráfico', () => {
  const series: SerieGrafico[] = [
    { rotulo: 'a', y: [1, null, 3], cor: '#000000' },
    { rotulo: 'b', y: [null, 2, null], cor: '#000000', tracejado: true },
  ];

  it('nenhuma série liga os dois lados de uma lacuna', () => {
    const s = seriesUplot(series, fmt);
    expect(s).toHaveLength(series.length + 1);
    for (const serie of s.slice(1)) expect(serie.spanGaps).toBe(false);
  });

  it('pontos sempre visíveis: dia isolado entre lacunas não some', () => {
    for (const serie of seriesUplot(series, fmt).slice(1)) {
      expect((serie.points as { show?: unknown }).show).toBe(true);
    }
  });

  it('o null do calendário chega intacto ao uPlot, um índice por dia', () => {
    // Dias 1, 2 e 6 têm linha; 3, 4 e 5 não; a época 2 começa no dia 6.
    const s = montarSerie([resumo(1), resumo(2), resumo(6, 2)], 1, 6, (r) => r.tempMedC100);
    const dados = dadosUplot(s.dias, s.trilhas.map((tr) => ({ rotulo: '', y: tr.y, cor: '#000000' })));
    expect(dados[0]).toEqual([1, 2, 3, 4, 5, 6].map((d) => d * SEG_DIA));
    expect(dados[1]).toEqual([3400, 3400, null, null, null, null]);
    expect(dados[2]).toEqual([null, null, null, null, null, 3400]);
  });
});
