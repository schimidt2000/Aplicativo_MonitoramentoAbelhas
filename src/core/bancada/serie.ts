/**
 * A série do gráfico ao vivo (feature 004), em trechos contínuos. Puro: o
 * componente só desenha o que sai daqui.
 *
 * LACUNA É LACUNA (Princípio VI). A linha se interrompe:
 *  - onde o valor veio sem número (`nan`);
 *  - onde passaram mais de 3 s entre duas leituras — linha perdida, placa
 *    reiniciando, cabo que saiu. A placa manda uma por segundo; ligar um ponto
 *    ao outro por cima do que não chegou seria inventar dado;
 *  - onde chegou uma linha ILEGÍVEL ou um TEXTO da placa entre duas leituras,
 *    mesmo em menos de 3 s: é a leitura que se perdeu (bytes perdidos, linha
 *    cortada) ou que falhou ("Erro na leitura do AHT20 (CRC/timeout)"). Sem
 *    isso, uma única leitura perdida (~2 s de intervalo) virava reta por cima
 *    dela;
 *  - nos VOLÁTEIS, onde o status do sensor de gás não é 0: enquanto ele aquece,
 *    o número que ele manda não é medição.
 *
 * Na temperatura e na umidade o status do gás NÃO interrompe a linha: o
 * sensor de temperatura é outro, e o teste que esta tela existe para fazer é
 * justamente ver a temperatura enquanto o sensor de gás aquece. É a mesma
 * regra dos resumos diários da 001 (`src/data/ingest.ts`: só o gás exclui por
 * status). O período de aquecimento aparece como FAIXA sombreada nas três
 * grandezas, com legenda. Decisão registrada na spec (Assumptions).
 */
import type { LeituraVista } from './sessao';

export type Grandeza = 'temperatura' | 'umidade' | 'volateis';

export const JANELA_DO_GRAFICO_MS = 5 * 60_000;
export const SILENCIO_QUE_INTERROMPE_MS = 3_000;

/** Grandezas cuja linha se interrompe quando o sensor de gás não está pronto. */
export const INTERROMPE_POR_STATUS_DO_GAS: Record<Grandeza, boolean> = {
  temperatura: false,
  umidade: false,
  volateis: true,
};

/** Valor na unidade bruta: centésimos de °C, centésimos de %UR, ppb. */
export interface PontoAoVivo { tMs: number; valor: number }

export interface Intervalo { inicioMs: number; fimMs: number }

export interface SerieAoVivo {
  inicioMs: number;
  fimMs: number;
  trechos: PontoAoVivo[][];
  /** Onde o sensor de gás não estava pronto (status diferente de 0). */
  gasNaoPronto: Intervalo[];
  pontos: number;
}

function valorDe(l: LeituraVista, g: Grandeza): number | null {
  switch (g) {
    case 'temperatura': return l.leitura.tempC100;
    case 'umidade': return l.leitura.rhX100;
    case 'volateis': return l.leitura.tvocPpb;
  }
}

/** Índice da primeira leitura com chegada >= t. As leituras estão em ordem de chegada. */
function primeiraDesde(ls: readonly LeituraVista[], t: number): number {
  let lo = 0;
  let hi = ls.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ls[m].chegadaMs < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export function serieAoVivo(
  leituras: readonly LeituraVista[],
  grandeza: Grandeza,
  opcoes: { fimMs: number; janelaMs?: number; silencioMs?: number },
): SerieAoVivo {
  const janela = opcoes.janelaMs ?? JANELA_DO_GRAFICO_MS;
  const silencio = opcoes.silencioMs ?? SILENCIO_QUE_INTERROMPE_MS;
  const fimMs = opcoes.fimMs;
  const inicioMs = fimMs - janela;
  const interrompePorGas = INTERROMPE_POR_STATUS_DO_GAS[grandeza];

  const trechos: PontoAoVivo[][] = [];
  const gasNaoPronto: Intervalo[] = [];
  let atual: PontoAoVivo[] = [];
  let faixa: Intervalo | null = null;
  let anterior: number | null = null;
  let pontos = 0;

  const fecharTrecho = () => {
    if (atual.length) trechos.push(atual);
    atual = [];
  };
  const fecharFaixa = () => {
    if (faixa) gasNaoPronto.push(faixa);
    faixa = null;
  };

  for (let i = primeiraDesde(leituras, inicioMs); i < leituras.length; i++) {
    const l = leituras[i];
    if (l.chegadaMs > fimMs) break;

    if (anterior !== null && (l.chegadaMs - anterior > silencio || l.depoisDeOutraLinha)) {
      fecharTrecho();
      fecharFaixa();
    }
    anterior = l.chegadaMs;

    const gasPronto = l.leitura.gasStatus === 0;
    if (gasPronto) {
      fecharFaixa();
    } else if (faixa) {
      faixa.fimMs = l.chegadaMs;
    } else {
      faixa = { inicioMs: l.chegadaMs, fimMs: l.chegadaMs };
    }

    const v = valorDe(l, grandeza);
    if (v === null || (interrompePorGas && !gasPronto)) {
      fecharTrecho();
      continue;
    }
    atual.push({ tMs: l.chegadaMs, valor: v });
    pontos++;
  }
  fecharTrecho();
  fecharFaixa();

  return { inicioMs, fimMs, trechos, gasNaoPronto, pontos };
}

/** Passo "redondo" para os rótulos do eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
function passoRedondo(span: number): number {
  const bruto = span / 2;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= bruto) return m * mag;
  }
  return 10 * mag;
}

export interface EscalaVertical { lo: number; hi: number; marcas: number[] }

/**
 * Escala com PISO: sem um intervalo mínimo, uma placa estável em 25,30 °C vira
 * montanha-russa — a escala amplia 0,05 °C até a altura inteira. Parece sinal
 * e é ruído (mesma decisão do Grafico.tsx da 001).
 */
export function escalaVertical(trechos: PontoAoVivo[][], spanMinimo: number): EscalaVertical | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of trechos) {
    for (const p of t) {
      if (p.valor < lo) lo = p.valor;
      if (p.valor > hi) hi = p.valor;
    }
  }
  if (lo === Infinity) return null;

  const spanAlvo = Math.max(hi - lo, spanMinimo, 1);
  if (spanAlvo > hi - lo) {
    const centro = (hi + lo) / 2;
    lo = centro - spanAlvo / 2;
    hi = centro + spanAlvo / 2;
  }
  const passo = passoRedondo(hi - lo);
  const loR = Math.floor(lo / passo) * passo;
  const hiR = Math.ceil(hi / passo) * passo;
  const marcas: number[] = [];
  for (let v = loR; v <= hiR + passo * 0.001; v += passo) marcas.push(Math.round(v * 1e6) / 1e6);
  return { lo: loR, hi: hiR, marcas };
}
