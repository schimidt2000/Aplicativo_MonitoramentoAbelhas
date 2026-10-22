/**
 * O que uma coleta devolve. Existe para que NENHUMA falha termine em silêncio:
 * a coleta não lança, ela descreve o que aconteceu, colmeia por colmeia, e a
 * tela decide como mostrar.
 */
import type { DesfechoDaSessao } from '../cabo/protocolo';
import type { ConferenciaDaContagem } from '../hora/tipos';

export type CodigoProblema =
  /** Procurou e não achou nenhum sensor. */
  | 'nenhuma-colmeia'
  /** Bluetooth/cabo indisponível ou sem permissão. */
  | 'transporte-indisponivel'
  /** Achou a colmeia, mas não conseguiu conectar. */
  | 'nao-conectou'
  /** A conexão caiu, ou travou, durante a transferência. */
  | 'conexao-caiu'
  /** O sensor fala numa versão de formato que não conhecemos. */
  | 'formato-desconhecido'
  /** Um pedaço dos dados chegou com defeito. */
  | 'dados-corrompidos'
  /** Não deu para gravar no celular (espaço, banco). */
  | 'nao-salvou'
  /** A placa respondeu com erro e não há leitura nova, ou perdeu o arquivo (feature 005). */
  | 'placa-recusou'
  | 'inesperado';

/**
 * Como ficou o acerto do relógio do nó nesta coleta.
 *  - `nao-tentado`:     nem chegamos a esse passo (a conexão falhou antes).
 *  - `acertado`:        o nó aceitou a hora do celular.
 *  - `nao-suportado`:   o nó não sabe receber hora. Não é problema do usuário.
 *  - `falhou`:          o nó diz que sabe, mas não aceitou ou não respondeu.
 *  - `celular-suspeito`: a hora do celular parece errada; NÃO enviamos.
 *  - `conflito`:        a hora do celular não bate com o tempo que o nó contou
 *                       desde outra coleta (feature 003, FR-010). NÃO enviamos,
 *                       e a tela pergunta ao apicultor se a data está certa.
 *  - `adiado`:          havia dúvida antes de transferir, e as leituras
 *                       mostraram que o nó reiniciou: não era conflito. Não
 *                       enviamos desta vez; a próxima coleta acerta. Sem aviso.
 */
export type EstadoRelogio =
  | 'nao-tentado' | 'acertado' | 'nao-suportado' | 'falhou' | 'celular-suspeito'
  | 'conflito' | 'adiado';

/** O que a tela precisa para perguntar "a data do celular está certa?" (FR-011). */
export interface ConflitoDeHora {
  nodeId: number;
  /** A referência de hora desta coleta, que o "Sim" confirma. */
  refId: number;
}

export interface ResultadoNo {
  deviceId: string;
  nome: string;
  /** Linhas realmente novas gravadas (as repetidas não contam). */
  inseridas: number;
  /** Linhas que o nó mandou, novas ou não. */
  recebidas: number;
  /** Quantos dias de leituras a coleta cobriu, aproximadamente. */
  dias: number;
  problema: CodigoProblema | null;
  relogio: EstadoRelogio;
  /** Presente só quando `relogio === 'conflito'`. */
  conflitoDeHora?: ConflitoDeHora;
  /**
   * Presente só na coleta pelo cabo (feature 005). Com ele, os avisos de
   * relógio da 001/003 não valem: "acertar o relógio" da placa é recomeçar o
   * arquivo dela, e quem explica é `core/cabo/mensagens.ts`.
   */
  cabo?: InfoDoCabo;
}

/** O que a coleta pelo cabo sabe além do que toda coleta sabe. */
export interface InfoDoCabo {
  desfecho: DesfechoDaSessao;
  /** A conferência da contagem desta coleta (null sem coleta plausível ou sem medição). */
  conferencia: ConferenciaDaContagem | null;
  /** Leituras deste arquivo que estão sem hora conhecida. */
  semHora: number;
  /** Primeira e última hora (estimada) das leituras deste arquivo. */
  periodo: { deMs: number; ateMs: number } | null;
  /** O MAC da placa já era de outra colmeia: as leituras foram para lá. */
  colmeiaPeloMac: boolean;
  /** Placa simulada (demonstração). */
  simulada: boolean;
  /**
   * Leituras com a chave de outras já gravadas e conteúdo diferente (005,
   * D-519): ficaram fora da série, guardadas só no bruto da sessão.
   */
  conflitos: number;
}

export interface ResultadoColeta {
  nos: ResultadoNo[];
  /** `deviceId` dos sensores achados que o app não conhece. */
  desconhecidos: string[];
  /** Problema que não pertence a uma colmeia específica. */
  geral: CodigoProblema | null;
}

export type Gravidade = 'problema' | 'aviso';

export interface ItemDeAviso {
  /** Estável, para `key` de lista e para testes. */
  id: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
}

/** Quando a coleta registra o desfecho na tabela `pull_session`. */
export function desfechoDaSessao(problema: CodigoProblema | null): string {
  switch (problema) {
    case null: return 'ok';
    // 'parcial' é o nome que a 001 já usava para "a transferência não terminou".
    case 'conexao-caiu': return 'parcial';
    case 'formato-desconhecido': return 'versao_desconhecida';
    case 'dados-corrompidos': return 'dados_corrompidos';
    case 'nao-conectou': return 'nao_conectou';
    case 'nao-salvou': return 'nao_salvou';
    case 'placa-recusou': return 'placa_recusou';
    case 'nenhuma-colmeia': return 'nenhuma_colmeia';
    case 'transporte-indisponivel': return 'transporte_indisponivel';
    case 'inesperado': return 'inesperado';
  }
}
