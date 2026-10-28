/**
 * Leitores de LINHA DE TEXTO, versionados. É a irmã da tabela binária
 * `versão → decodificador` de ./index.ts, para o que a placa imprime no Serial.
 *
 * Mesma regra (Princípio IV): uma tabela `formato → leitor`, nunca um parser
 * único com `if`. Quando o grupo do firmware mudar a linha, o trabalho é
 * escrever um leitor novo e acrescentar uma linha na tabela — o `bancada-0`
 * fica como está, porque descreve o que a placa de bancada de 2026-10-14
 * imprime (docs/integracao-firmware.md).
 *
 * Nada aqui é uma leitura do banco: uma linha de bancada não tem nó sensor
 * nem número de leitura, que são a chave `(node_id, seq)`.
 */
import { lerLinhaBancada0 } from './bancada0';

export { TAMANHO_MAXIMO_DE_LINHA } from './limites';

/** Situação do sensor de gás (ENS160), pelo `Status` que ele mesmo informa. */
export type EstadoGas =
  | 'normal'            // 0
  | 'aquecendo'         // 1
  | 'primeira-partida'  // 2 — pode levar cerca de 1 hora
  | 'invalido'          // 3
  | 'desconhecido';     // qualquer outro número: mostramos, não adivinhamos

/** Por que um valor ficou em branco. Nunca 0, -1 ou -999 no lugar disso. */
export type MotivoAusencia = 'sem-numero';

export interface LeituraDeLinha {
  tipo: 'leitura';
  /** Centésimos de °C, exatos, como a placa mandou. */
  tempC100: number | null;
  motivoTemp: MotivoAusencia | null;
  /** Centésimos de %UR, exatos. */
  rhX100: number | null;
  motivoUmidade: MotivoAusencia | null;
  gasStatus: number;
  estadoGas: EstadoGas;
  /** Sensor de gás ainda não está em regime (status 1 ou 2). */
  aquecendo: boolean;
  /** O texto entre parênteses depois do Status, se veio. Só informativo. */
  rotuloStatus: string | null;
  aqiUba: number;
  tvocPpb: number;
  /** DERIVADO dos voláteis pelo próprio sensor. NÃO é CO₂ (Princípio VI). */
  eco2Ppm: number;
}

/**
 *  - `fora-do-formato`: parece leitura (tem `T=`, `TVOC=`…) mas não casa. É a
 *    linha cortada ao conectar, ou o formato mudou — não dá para distinguir;
 *  - `caracteres-estranhos`: controle ou byte que não é texto (velocidade
 *    errada na porta, ruído no cabo);
 *  - `longa-demais`: passou de TAMANHO_MAXIMO_DE_LINHA sem fim de linha;
 *  - `interrompida`: a conexão acabou, ou a porta perdeu bytes, no meio dela.
 */
export type MotivoIlegivel =
  | 'fora-do-formato'
  | 'caracteres-estranhos'
  | 'longa-demais'
  | 'interrompida';

export type LinhaInterpretada =
  | LeituraDeLinha
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ilegivel'; texto: string; motivo: MotivoIlegivel }
  | { tipo: 'vazia' };

/** Um leitor nunca lança: linha que não entende vira 'ilegivel' ou 'texto'. */
export type LeitorDeLinha = (linha: string) => LinhaInterpretada;

export type FormatoDeLinha = 'bancada-0';

/** O formato que a tela de cabo usa enquanto as linhas não trazem versão. */
export const FORMATO_DE_LINHA_ATUAL: FormatoDeLinha = 'bancada-0';

const LEITORES: Record<FormatoDeLinha, LeitorDeLinha> = {
  'bancada-0': lerLinhaBancada0,
};

export class FormatoDeLinhaDesconhecidoError extends Error {
  constructor(readonly formato: string) {
    super(`Formato de linha ${formato} não reconhecido.`);
    this.name = 'FormatoDeLinhaDesconhecidoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function formatoDeLinhaSuportado(formato: string): formato is FormatoDeLinha {
  return Object.prototype.hasOwnProperty.call(LEITORES, formato);
}

/** Escolhe o leitor pelo formato. Formato desconhecido é recusado, nunca "tentado". */
export function leitorDeLinha(formato: string): LeitorDeLinha {
  if (!formatoDeLinhaSuportado(formato)) throw new FormatoDeLinhaDesconhecidoError(formato);
  return LEITORES[formato];
}
