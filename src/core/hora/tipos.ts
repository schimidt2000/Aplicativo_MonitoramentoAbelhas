/**
 * Vocabulário da hora das leituras (feature 003). Domínio puro: nada aqui sabe
 * de banco, de transporte ou de tela.
 *
 * Na spec, "ligada" é o período entre uma energização do nó e a próxima falta
 * de energia, e "referência" (âncora) é o par hora do celular × contador do nó.
 */

/** O que o nó sabe de tempo. Espelha `NodeInfo.clockMode`. `contagem`: feature 005. */
export type ModoRelogio = 'none' | 'uptime' | 'rtc' | 'contagem';

/**
 * Qualidade da hora, como a constituição define (Princípio III):
 * `{rtc, anchored, estimated, unknown}`. Os números são os da 001 e já estão
 * gravados em `reading.t_quality` e na nuvem — não mudam.
 */
export const QUALIDADE = { rtc: 0, ancorada: 1, estimada: 2, desconhecida: 3 } as const;
export type Qualidade = (typeof QUALIDADE)[keyof typeof QUALIDADE];

/** Por que a hora de uma leitura é estimada ou desconhecida. Ancorada não tem motivo. */
export type MotivoHora =
  /** Gravada e ainda não avaliada (a avaliação roda no fim da coleta). */
  | 'em-avaliacao'
  /** Única referência da ligada: nenhuma outra coleta concordou com ela ainda (FR-012). */
  | 'referencia-nao-conferida'
  /** A referência discorda de outra da mesma ligada, ou a hora do celular voltou (FR-010). */
  | 'conflito-de-hora'
  /** Nenhuma referência válida na ligada desta leitura (FR-016). */
  | 'ligada-sem-referencia'
  /** O nó não tem noção de tempo nenhuma (FR-008, FR-016). */
  | 'sem-nocao-de-tempo'
  /** Nó que carimba a hora, mas sem acerto conhecido antes desta leitura (FR-007). */
  | 'hora-do-no-sem-acerto'
  /** Nó que carimba a hora a partir de um acerto que foi revogado (FR-007). */
  | 'acerto-revogado'
  /* Feature 005 — hora pela contagem (início do arquivo + número × intervalo). */
  /** A conta fechou com a hora do fim da coleta: hora ESTIMADA. */
  | 'contagem-conferida'
  /** Nenhuma coleta com hora plausível viu estas medições. */
  | 'contagem-sem-conferencia'
  /** Mais medições do que o tempo permite (botão apertado sem coleta). */
  | 'contagem-a-mais'
  /** Menos medições do que o tempo permite (falta de energia, medição perdida). */
  | 'contagem-a-menos'
  /** Início do arquivo antes do projeto ou depois da coleta. */
  | 'inicio-implausivel';

/** O mínimo de uma leitura que a avaliação precisa. Ordenadas por `seq`. */
export interface LeituraDeTempo {
  seq: number;
  /** Contador bruto do nó. Em modo `none` não significa nada. */
  tNode: number;
  /** Número da ligada que o nó informou, se informou (FR-001). */
  ligada: number | null;
  /** NULL nas leituras anteriores à 003: tratadas como `uptime`. */
  modo: ModoRelogio | null;
}

export type OrigemReferencia = 'coleta' | 'acerto' | 'semente' | 'legado';

export interface Referencia {
  id: number;
  /** Referências da mesma visita (coleta + acerto) têm o mesmo grupo e não se conferem. */
  grupo: number;
  tNode: number;
  tUtcMs: number;
  /** Número da ligada informado pelo nó, se informou. */
  ligada: number | null;
  /** Maior `seq` do nó no momento da referência (`NodeInfo.newestSeq`). */
  seqRef: number | null;
  /**
   * Período de medição que o nó informou na sessão (`NodeInfo.samplePeriodS`).
   * É ele, e não o do cadastro, que diz quão longe da última leitura o
   * contador pode estar sem um reinício no meio. Ausente nas referências
   * antigas: vale o do cadastro (`ParametrosHora.periodoS`).
   */
  periodoS?: number | null;
  modo: ModoRelogio | null;
  origem: OrigemReferencia;
  /** Hora do celular plausível e nó com noção de tempo, na hora de gravar. */
  aceita: boolean;
  revogada: boolean;
  /** O apicultor respondeu "Sim, está certa" para a coleta desta referência. */
  confirmada: boolean;
  /**
   * Só para decidir o envio da hora ANTES da transferência: a leitura `seqRef`
   * ainda não chegou, então a ligada é a da última leitura gravada, por hipótese.
   */
  provisoria?: boolean;
}

export type EstadoReferencia =
  | 'rejeitada' | 'revogada' | 'sem-ligada'
  | 'nao-conferida' | 'conferida' | 'em-conflito';

/** Uma ligada do nó, como a avaliação a reconstruiu a partir das leituras. */
export interface Ligada {
  /** `seq` da primeira leitura. É o identificador da ligada. */
  id: number;
  seqIni: number;
  seqFim: number;
  modo: ModoRelogio;
  /** Número informado pelo nó, se todas as leituras dela o trouxeram. */
  numero: number | null;
  quantidade: number;
}

/**
 * Faixa contígua de leituras com a mesma conta de hora:
 * `t_utc = refTUtcMs − (refTNode − t_node) × 1000`. `refTUtcMs = null` é hora
 * desconhecida.
 */
export interface Faixa {
  seqIni: number;
  seqFim: number;
  ligada: number | null;
  refId: number | null;
  refTNode: number;
  refTUtcMs: number | null;
  qualidade: Qualidade;
  motivo: MotivoHora | null;
  /**
   * Quanto vale uma unidade de `t_node`, em ms. Ausente: 1000 (o contador da
   * 003 é em segundos). Na contagem (005), `t_node` é o número da medição e
   * isto é o intervalo × 1000.
   */
  msPorUnidade?: number;
}

export interface SituacaoReferencia {
  estado: EstadoReferencia;
  /** Chave interna da ligada (`s:<seq>`, `p:<seq>`, `n:<número>`), ou null. */
  ligada: string | null;
}

export interface AvaliacaoDasHoras {
  ligadas: Ligada[];
  faixas: Faixa[];
  referencias: Map<number, SituacaoReferencia>;
  /** Pares de referências que discordam. Base da revogação no "Sim" (FR-011). */
  discordancias: Array<[number, number]>;
  /** Uma por coleta de nó em contagem (feature 005): o que a conferência achou. */
  contagens: ConferenciaDaContagem[];
}

export type VereditoDaContagem = 'fecha' | 'a-mais' | 'a-menos' | 'inicio-implausivel';

/** A conferência de uma coleta de nó em contagem contra a hora do fim da coleta (005, FR-017). */
export interface ConferenciaDaContagem {
  refId: number;
  /** Hora de início do arquivo, segundos Unix. */
  inicioS: number;
  /** Quantas medições a coleta viu nesse arquivo. */
  medicoes: number;
  intervaloS: number;
  /** Hora do celular quando o arquivo chegou. */
  horaDaColetaMs: number;
  /** Quantas medições caberiam, no ritmo, entre o início e a coleta. */
  esperadas: number;
  /** Hora da coleta − hora calculada da última medição, em s. */
  sobraS: number;
  folgaS: number;
  veredito: VereditoDaContagem;
}

export interface ParametrosHora {
  /** Período de medição do nó no cadastro, em segundos. Referência que traz o seu vale mais. */
  periodoS: number;
  inicioDoProjetoMs: number;
  /**
   * Intervalo entre medições da placa em contagem (005), do cadastro do nó. O
   * `FILE_INFO` da coleta, se trouxer, vale mais. Ausente: 7200 s.
   */
  intervaloContagemS?: number;
}
