/**
 * Sessão do monitor de bancada (feature 004): o que a tela viu desde que
 * abriu. Vive SÓ na memória. Nada aqui conhece o banco — e um teste reprova
 * se algum arquivo da 004 importar `src/data` (Princípio III).
 *
 * Por que não grava: uma linha de bancada não traz identificador da placa
 * nem número da leitura, que são a chave `(node_id, seq)`. Gravar exigiria
 * inventar os dois. Ver specs/004-leitura-por-cabo/spec.md.
 *
 * Mutável de propósito: chega uma linha por segundo por até 6 horas, e
 * copiar 21.600 leituras a cada segundo só para o React notar a mudança
 * seria desperdício. A tela guarda a sessão num `useRef` e conta versões.
 */
import {
  FORMATO_DE_LINHA_ATUAL, leitorDeLinha,
  type FormatoDeLinha, type LeituraDeLinha, type LinhaInterpretada, type MotivoIlegivel,
} from '../decode/linhas';

/** Uma linha que chegou da porta, como o transporte entrega. */
export interface LinhaDaPorta {
  texto: string;
  corte: 'longa-demais' | 'interrompida' | null;
}

/** Uma leitura vista: o que o leitor extraiu, a hora do computador e a linha original. */
export interface LeituraVista {
  chegadaMs: number;
  leitura: LeituraDeLinha;
  bruta: string;
  /**
   * Chegou outra linha — ilegível OU texto da placa — entre a leitura anterior
   * e esta. Ilegível é, muito provavelmente, uma leitura que se perdeu (bytes
   * perdidos, linha cortada); texto no meio das leituras é a placa avisando
   * algo, inclusive que a medição falhou ("Erro na leitura do AHT20
   * (CRC/timeout)"). O gráfico quebra a linha aqui, mesmo que o intervalo seja
   * curto (Princípio VI: nunca ligar um ponto ao outro por cima do que não
   * chegou ou falhou).
   */
  depoisDeOutraLinha: boolean;
}

export type MensagemDaPlaca =
  | { chegadaMs: number; tipo: 'texto'; texto: string }
  | { chegadaMs: number; tipo: 'ilegivel'; texto: string; motivo: MotivoIlegivel };

/** 6 horas a uma leitura por segundo. */
export const MAXIMO_DE_LEITURAS = 6 * 60 * 60;
/** O registro de mensagens na tela. */
export const MAXIMO_DE_MENSAGENS = 50;

/**
 * Tudo o que a tela viu desde que abriu, inclusive o que já saiu da memória.
 * A planilha conta de novo o que leva, a partir das leituras que leva.
 */
export interface Contagens {
  leituras: number;
  /** Status do sensor de gás diferente de 0 (Princípio VI). */
  gasForaDoNormal: number;
  textos: number;
  ilegiveis: number;
  /** Leituras mais antigas que saíram da memória pelo teto de 6 horas. */
  descartadas: number;
}

export class SessaoDoMonitor {
  readonly formato: FormatoDeLinha;
  private readonly ler: (linha: string) => LinhaInterpretada;
  private readonly _leituras: LeituraVista[] = [];
  private readonly _mensagens: MensagemDaPlaca[] = [];
  readonly contagens: Contagens = {
    leituras: 0, gasForaDoNormal: 0, textos: 0, ilegiveis: 0, descartadas: 0,
  };
  inicioMs: number | null = null;
  /** Hora da última linha de qualquer tipo. */
  ultimaChegadaMs: number | null = null;
  /** Houve linha que não é leitura (texto ou ilegível) desde a última leitura? */
  private outraLinhaDesdeAUltimaLeitura = false;

  constructor(
    formato: string = FORMATO_DE_LINHA_ATUAL,
    private readonly tetos = { leituras: MAXIMO_DE_LEITURAS, mensagens: MAXIMO_DE_MENSAGENS },
  ) {
    // Lança FormatoDeLinhaDesconhecidoError: formato desconhecido nunca é "tentado".
    this.ler = leitorDeLinha(formato);
    this.formato = formato as FormatoDeLinha;
  }

  /** Recebe uma linha da porta. Nunca lança. Devolve como ela foi entendida. */
  receber(linha: LinhaDaPorta, agoraMs: number): LinhaInterpretada {
    const entendida: LinhaInterpretada = linha.corte
      ? { tipo: 'ilegivel', texto: linha.texto, motivo: linha.corte }
      : this.ler(linha.texto);

    if (entendida.tipo === 'vazia') return entendida;

    this.inicioMs ??= agoraMs;
    this.ultimaChegadaMs = agoraMs;

    switch (entendida.tipo) {
      case 'leitura':
        this.contagens.leituras++;
        if (entendida.gasStatus !== 0) this.contagens.gasForaDoNormal++;
        this._leituras.push({
          chegadaMs: agoraMs, leitura: entendida, bruta: linha.texto,
          depoisDeOutraLinha: this.outraLinhaDesdeAUltimaLeitura,
        });
        this.outraLinhaDesdeAUltimaLeitura = false;
        if (this._leituras.length > this.tetos.leituras) {
          this._leituras.shift();
          this.contagens.descartadas++;
        }
        break;
      case 'texto':
        this.contagens.textos++;
        this.outraLinhaDesdeAUltimaLeitura = true;
        this.guardarMensagem({ chegadaMs: agoraMs, tipo: 'texto', texto: entendida.texto });
        break;
      case 'ilegivel':
        this.contagens.ilegiveis++;
        this.outraLinhaDesdeAUltimaLeitura = true;
        this.guardarMensagem({
          chegadaMs: agoraMs, tipo: 'ilegivel', texto: entendida.texto, motivo: entendida.motivo,
        });
        break;
    }
    return entendida;
  }

  private guardarMensagem(m: MensagemDaPlaca) {
    this._mensagens.push(m);
    if (this._mensagens.length > this.tetos.mensagens) this._mensagens.shift();
  }

  /** Leituras em ordem de chegada. Não modifique: é a memória da sessão. */
  get leituras(): readonly LeituraVista[] {
    return this._leituras;
  }

  /** Mensagens, a mais recente PRIMEIRO, como o registro mostra. */
  mensagensRecentes(): MensagemDaPlaca[] {
    return [...this._mensagens].reverse();
  }

  ultimaLeitura(): LeituraVista | null {
    return this._leituras.length ? this._leituras[this._leituras.length - 1] : null;
  }
}
