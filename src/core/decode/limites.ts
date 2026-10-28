/**
 * Maior linha que alguém guarda na memória. Uma linha `bancada-0` tem ~60
 * caracteres; uma mensagem de texto da placa, ~80. Acima disto é lixo (placa
 * em outra velocidade, fim de linha perdido) e não pode crescer sem limite.
 *
 * Fica num módulo à parte para `bancada0.ts` não importar valor de
 * `linhas.ts`, que importa `bancada0.ts`: sem ciclo de require.
 */
export const TAMANHO_MAXIMO_DE_LINHA = 512;
