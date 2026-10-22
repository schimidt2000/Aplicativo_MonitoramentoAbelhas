/**
 * Voláteis (COVs) só relativos à própria colmeia (Princípio VI, FR-031).
 *
 * O valor absoluto de voláteis depende do sensor, da idade dele, da posição na
 * caixa e da própria colônia. Duas colmeias com 300 e 1.500 ppb não dizem que
 * uma está "pior". Por isso o painel nunca mostra o número cru lado a lado: ele
 * mostra um ÍNDICE em que 100 é a linha de base daquela trilha (mesmo nó sensor,
 * mesma época), calculada só com os dias daquela trilha no período escolhido.
 *
 * Consequência que os testes travam: multiplicar todos os voláteis de uma
 * colmeia por 5 não muda o índice dela; e mudar os voláteis da época 2 não
 * muda o índice da época 1.
 */
import type { Serie, TrilhaSerie } from './serie';

/** Com menos dias que isso a mediana não é linha de base, é ruído. */
export const MIN_DIAS_LINHA_BASE = 3;

export interface TrilhaIndice extends TrilhaSerie {
  /** Mediana das médias diárias da trilha, em ppb. null = sem linha de base. */
  base: number | null;
}

export interface SerieIndice {
  dias: number[];
  trilhas: TrilhaIndice[];
}

/** Mediana dos valores presentes. null quando há menos de `MIN_DIAS_LINHA_BASE`. */
export function linhaDeBase(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length < MIN_DIAS_LINHA_BASE) return null;
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  // Linha de base zero não serve de divisor: sem índice, em vez de infinito.
  return mediana > 0 ? mediana : null;
}

/**
 * Converte a série de voláteis (ppb) em índice. Cada trilha é dividida pela
 * PRÓPRIA linha de base; nenhuma informação passa de uma trilha para outra.
 * Trilha sem linha de base fica toda `null` (vira aviso na tela, não linha).
 */
export function indiceVolateis(serie: Serie): SerieIndice {
  return {
    dias: serie.dias,
    trilhas: serie.trilhas.map((tr) => {
      const base = linhaDeBase(tr.y);
      return {
        ...tr,
        base,
        y: tr.y.map((v) => (v === null || base === null ? null : (100 * v) / base)),
      };
    }),
  };
}
