/**
 * Porta da nuvem. Recebe o mesmo tratamento que o transporte (Princípio IV):
 * o domínio e a UI falam com esta interface e nunca com um SDK.
 *
 * Duas consequências que valem a disciplina:
 *  - a nuvem simulada existe ANTES do cliente real, então o envio inteiro é
 *    construído e testado sem servidor nenhum;
 *  - trocar Supabase por outra coisa é escrever outra implementação, não
 *    refatorar o app.
 *
 * `node_id` NUNCA aparece aqui. Ele é surrogate AUTOINCREMENT local: dois
 * celulares dão números diferentes ao mesmo nó físico. A identidade que
 * atravessa a fronteira é `deviceId`.
 */

export type MotivoFalha =
  /** Sem internet agora. Não é erro: é o estado normal no sertão. */
  | 'sem-rede'
  /** A rede responde, mas exige autenticação no navegador. */
  | 'portal-cativo'
  /** O aparelho ainda não foi ligado a um projeto. */
  | 'sem-vinculo'
  /** O código digitado não vale. */
  | 'codigo-invalido'
  /** Erros demais na última hora: esperar e tentar de novo. */
  | 'muitas-tentativas'
  /** Erros demais em 24 h neste celular: travado até o dia seguinte. */
  | 'codigo-travado'
  /** Falha do servidor. Vale retentar. */
  | 'servidor'
  /** Recusa permanente. Não adianta retentar sem mudar algo. */
  | 'recusado'
  | 'tempo-esgotado';

export type Resultado =
  | { ok: true }
  | { ok: false; motivo: MotivoFalha; detalhe?: string };

/** Uma leitura pronta para atravessar a fronteira. Espelha a linha local. */
export interface LeituraParaEnvio {
  deviceId: string;
  seq: number;
  tNode: number;
  /**
   * Hora EFETIVA no momento do envio (feature 003). NULL quando a hora da
   * leitura é desconhecida (FR-016): nunca uma hora inventada.
   */
  tUtcMs: number | null;
  tQuality: number;
  tempC100: number | null;
  rhX100: number | null;
  tvocPpb: number | null;
  eco2Ppm: number | null;
  aqiUba: number | null;
  gasStatus: number | null;
  battMv: number | null;
  flags: number;
  bootId: string | null;
  sensorEpoch: number;
  calibVersion: number;
  protoVer: number;
  src: string;
}

/** Cadastro que precisa existir no servidor ANTES das leituras (ver sync.ts). */
export interface CadastroParaEnvio {
  apiarios: {
    id: string; nome: string; municipio: string | null; uf: string | null;
    updatedMs: number; deletedMs: number | null;
  }[];
  colmeias: {
    id: string; apiarioId: string; nome: string; especie: string | null;
    instaladaEm: number | null; updatedMs: number; deletedMs: number | null;
  }[];
  nos: {
    deviceId: string; colmeiaId: string | null; placement: string | null;
    periodS: number; sensorEpoch: number; calibVersion: number;
    tempOffsetC100: number; updatedMs: number;
  }[];
}

export interface Vinculo {
  apicultorNome: string;
  projetoNome: string;
}

export interface ClienteNuvem {
  readonly nome: string;

  /**
   * Há caminho até o servidor agora? Distingue ausência de rede de portal
   * cativo — a rede de praça que responde 200 com HTML é a falha que mais
   * parece defeito do app. Nunca lança.
   */
  verificarConexao(): Promise<Resultado>;

  vinculoAtual(): Promise<Vinculo | null>;

  /** Liga o aparelho a um apicultor. Uma vez só, no fluxo de envio. */
  vincular(codigo: string): Promise<Resultado & { vinculo?: Vinculo }>;

  desvincular(): Promise<void>;

  enviarCadastro(cadastro: CadastroParaEnvio): Promise<Resultado>;

  /**
   * Envia um lote. DEVE ser idempotente no servidor: reenviar o mesmo lote
   * não cria linha nova. Um `ok: true` significa gravado de forma durável.
   */
  enviarLeituras(lote: LeituraParaEnvio[]): Promise<Resultado>;
}
