/**
 * Junta os pedaços que chegam da porta em linhas.
 *
 * Pela USB, uma linha de 60 caracteres chega em 1, 2 ou 5 pedaços, partidos
 * em qualquer lugar — inclusive entre o `\r` e o `\n`. Este módulo recebe
 * TEXTO já decodificado (o caractere acentuado partido entre pedaços é
 * problema do decodificador em fluxo, em ./serial.ts) e devolve linhas
 * completas.
 *
 * Fim de linha: `\r\n` (Serial.println), `\n` ou `\r` sozinho. O `\r\n` partido
 * em dois pedaços gera uma linha vazia a mais, que o leitor descarta.
 *
 * Memória limitada por construção: sem fim de linha por TAMANHO_MAXIMO_DE_LINHA
 * caracteres, o que veio sai marcado como `longa-demais` e o resto é jogado
 * fora até o próximo fim de linha.
 */
import { TAMANHO_MAXIMO_DE_LINHA } from '@/core/decode/linhas';

export interface LinhaRecebida {
  texto: string;
  /**
   * Por que a linha está incompleta, se estiver:
   *  - `longa-demais`: passou do teto sem fim de linha;
   *  - `interrompida`: a conexão acabou, ou a porta avisou que perdeu bytes,
   *    no meio dela.
   */
  corte: 'longa-demais' | 'interrompida' | null;
}

const FIM_DE_LINHA = /\r\n|\r|\n/;

export class JuntadorDeLinhas {
  private resto = '';
  private descartando = false;

  constructor(private readonly maximo = TAMANHO_MAXIMO_DE_LINHA) {}

  /** Acrescenta um pedaço e devolve as linhas que ele completou. */
  empurrar(pedaco: string): LinhaRecebida[] {
    const saida: LinhaRecebida[] = [];
    let texto = this.resto + pedaco;
    this.resto = '';

    for (;;) {
      const m = FIM_DE_LINHA.exec(texto);
      if (!m) break;
      const linha = texto.slice(0, m.index);
      texto = texto.slice(m.index + m[0].length);
      if (this.descartando) {
        // Fim do lixo que já foi entregue como longa-demais.
        this.descartando = false;
        continue;
      }
      saida.push({ texto: linha, corte: null });
    }

    if (this.descartando) return saida;

    if (texto.length > this.maximo) {
      saida.push({ texto: texto.slice(0, this.maximo), corte: 'longa-demais' });
      this.descartando = true;
    } else {
      this.resto = texto;
    }
    return saida;
  }

  /**
   * A conexão acabou ou perdeu bytes: o que estava pela metade não é uma
   * linha confiável. Devolve-o marcado (ou nada) e recomeça do zero.
   */
  interromper(): LinhaRecebida[] {
    const resto = this.resto;
    this.resto = '';
    this.descartando = false;
    return resto.trim() === '' ? [] : [{ texto: resto, corte: 'interrompida' }];
  }

  /** Só para teste: quanto está guardado à espera do fim de linha. */
  get pendente(): number {
    return this.resto.length;
  }
}
