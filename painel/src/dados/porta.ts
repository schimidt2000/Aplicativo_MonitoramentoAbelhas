/**
 * Porta de acesso a dados do painel. As telas falam com esta interface e nunca
 * com um SDK — o mesmo tratamento que o app de campo dá à nuvem e ao transporte.
 *
 * Duas implementações: `demo.ts` (em memória, determinística) e `supabase.ts`.
 *
 * O que NÃO está aqui, de propósito:
 *  - voláteis na visão geral. `ColmeiaMacro` não tem campo de COVs: comparar
 *    valor absoluto de voláteis entre colmeias é proibido (Princípio VI,
 *    FR-031), e o jeito mais barato de garantir isso é o dado nem chegar à tela.
 *  - coordenadas. O servidor não tem coluna de latitude nem longitude (FR-022).
 *  - qualquer escrita. O painel só lê.
 */

export type Criacao = 'apis' | 'meliponineo';

/** Uma linha da visão geral: uma colmeia. */
export interface ColmeiaMacro {
  colmeiaId: string;
  colmeiaNome: string;
  apicultorNome: string;
  /** Nome do apiário ou meliponário, como o apicultor cadastrou. */
  localNome: string;
  /** null quando o cadastro não diz a criação. */
  criacao: Criacao | null;
  municipio: string | null;
  uf: string | null;
  /** UTC, ms. null quando a colmeia nunca teve leitura no servidor. */
  ultimaLeituraMs: number | null;
  leituras: number;
  excluidas: number;
}

/** Um nó sensor que já esteve numa colmeia. */
export interface NoSensorPainel {
  /** Identidade estável do nó (device_id), nunca o node_id local do celular. */
  noId: string;
  colmeiaId: string;
  /** Correção de temperatura do nó, °C × 100. Aplicada só na exibição. */
  correcaoTempC100: number;
  /** null quando o servidor não sabe o modelo. */
  modeloSensor: string | null;
}

/**
 * Resumo diário de um nó sensor, numa época de sensor. O servidor só devolve os
 * dias que têm linha: dia ausente chega como elemento AUSENTE, não como null.
 * Quem desenha precisa percorrer o calendário (ver `dominio/serie.ts`).
 *
 * Valores brutos, nas unidades do banco (centésimos), sem correção aplicada.
 */
export interface ResumoDiario {
  noId: string;
  /** Dias desde 1970-01-01 UTC. */
  dia: number;
  epocaSensor: number;
  /** Menor temperatura do dia, °C × 100 (no servidor, `temp_p5`, hoje MIN). */
  tempMinC100: number | null;
  /** MÉDIA do dia, °C × 100 (no servidor, `temp_med`, que é AVG). */
  tempMedC100: number | null;
  /** Maior temperatura do dia, °C × 100 (no servidor, `temp_p95`, hoje MAX). */
  tempMaxC100: number | null;
  /** Média da umidade do dia, % × 100. */
  umidMedX100: number | null;
  /** Média dos voláteis válidos do dia, ppb. */
  tvocMedPpb: number | null;
  /** Leituras válidas que entraram no resumo. */
  validas: number;
  /** Amostras marcadas inválidas pelo sensor e excluídas do resumo. */
  excluidas: number;
}

/** Qualidade da hora de uma leitura, em palavra (feature 003, FR-018). */
export type QualidadeHora = 'ancorada' | 'estimada' | 'desconhecida';

/** Uma leitura, para a planilha. Valores brutos, sem arredondar. */
export interface LeituraPainel {
  colmeiaId: string;
  noId: string;
  seq: number;
  /** UTC, ms. null quando a hora é desconhecida. */
  tUtcMs: number | null;
  qualidadeHora: QualidadeHora;
  epocaSensor: number;
  versaoFormato: number;
  tempC100: number | null;
  umidX100: number | null;
  tvocPpb: number | null;
  /** eCO₂ do sensor: DERIVADO de voláteis, não é CO₂. */
  eco2Ppm: number | null;
  /** Situação do sensor de gás; diferente de 0 marca a amostra como excluída. */
  situacaoGas: number | null;
}

export interface Sessao {
  /** Só o e-mail, para mostrar quem entrou. Nunca vai para o endereço. */
  email: string | null;
}

export type MotivoProblema = 'sem-internet' | 'servidor';

export type ResultadoEntrada =
  | { ok: true; sessao: Sessao }
  | { ok: false; motivo: 'credenciais' | MotivoProblema };

/** Problema ao buscar dado. A tela traduz em texto via `textos`. */
export class ProblemaDados extends Error {
  constructor(public readonly motivo: MotivoProblema) {
    super(motivo);
  }
}

export interface FontePainel {
  readonly modo: 'demonstracao' | 'supabase';

  sessaoAtual(): Promise<Sessao | null>;
  entrar(email: string, senha: string): Promise<ResultadoEntrada>;
  sair(): Promise<void>;

  visaoGeral(): Promise<ColmeiaMacro[]>;
  /** null quando a colmeia não existe ou a pesquisadora não tem acesso. */
  colmeia(colmeiaId: string): Promise<ColmeiaMacro | null>;
  nosSensores(colmeiaIds: string[]): Promise<NoSensorPainel[]>;

  /** Resumos de `deDia` a `ateDia`, inclusive. Só os dias que têm linha. */
  resumosDiarios(colmeiaId: string, deDia: number, ateDia: number): Promise<ResumoDiario[]>;

  /**
   * Leituras de várias colmeias num intervalo UTC [deMs, ateMs). Devolve no
   * máximo `limite + 1` linhas, para que a tela saiba que o recorte é grande
   * demais sem baixar tudo.
   */
  leituras(
    colmeiaIds: string[], deMs: number, ateMs: number, limite: number,
  ): Promise<LeituraPainel[]>;
}

/** A regra de exclusão do servidor e do celular: situação do gás diferente de 0. */
export function amostraExcluida(situacaoGas: number | null): boolean {
  return situacaoGas !== null && situacaoGas !== 0;
}
