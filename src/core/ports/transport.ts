/**
 * A fronteira do Princípio IV: o payload do nó é contrato de outra equipe e vai
 * mudar. Domínio e UI NUNCA importam SDK de transporte — só este arquivo.
 * Ver specs/001-coleta-offline/contracts/transport.md.
 */

export type TransportKind = 'mock' | 'ble' | 'cable' | 'file';

export type UnsupportedReason =
  | 'plataforma-sem-api'
  | 'versao-so-antiga'
  | 'hardware-ausente';

/**
 * Motivos pelos quais um transporte falha. A coleta decide o que dizer ao
 * usuário olhando para ESTE código — nunca lendo `message`, que é técnica e
 * pode estar em inglês.
 *
 * Todo transporte MUST lançar `timeout` se ficar um tempo razoável sem receber
 * nada: a coleta não tem como adivinhar que uma conexão travou.
 */
export type TransportErrorCode =
  /** O nó não respondeu, ou sumiu do alcance antes de conectar. */
  | 'not-found'
  /** A conexão caiu. */
  | 'connection-lost'
  /** Sem resposta no tempo combinado. */
  | 'timeout'
  /** Falta permissão do sistema (Bluetooth, localização, USB). */
  | 'permission'
  /** O rádio ou o cabo não está disponível: Bluetooth desligado, sem cabo. */
  | 'unavailable';

export class TransportError extends Error {
  constructor(readonly code: TransportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TransportError';
    // Mantém `instanceof` mesmo quando a classe é compilada para ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface NodeInfo {
  protoVer: number;
  /** Identificador estável da fonte. NUNCA o endereço MAC. */
  deviceId: string;
  bootId: string | null;
  fwVersion: string | null;
  /**
   * O que o nó sabe de tempo.
   *  - `none`:   nada. Cada leitura não traz tempo algum; a hora só pode ser
   *              ESTIMADA contando leituras × período.
   *  - `uptime`: contador relativo (segundos desde que ligou). É o caso bom:
   *              com ele a hora de cada leitura sai exata da âncora.
   *  - `rtc`:    hora absoluta própria.
   *  - `contagem`: só a hora de início do arquivo e o número de cada medição
   *              (firmware de 2026-10-21, feature 005). A hora sai da conta
   *              início + número × intervalo, sempre estimada.
   */
  clockMode: 'none' | 'uptime' | 'rtc' | 'contagem';
  /** O que o nó sabe fazer. Vem na identificação, antes de qualquer transferência. */
  caps: { setTime: boolean };
  oldestSeq: number;
  newestSeq: number;
  recordCount: number;
  samplePeriodS: number;
  battMv: number | null;
  /**
   * Número da ligada atual (quantas vezes o nó ligou), se o nó informar.
   * Feature 003, FR-001. SUPOSIÇÃO NÃO CONFIRMADA (pergunta 6): o formato v1 não
   * traz, e aí a ligada sai da regressão do contador (FR-002).
   */
  ligada?: number | null;
}

/** Uma leitura decodificada, AINDA EM TEMPO DO NÓ. */
export interface Reading {
  seq: number;
  tNode: number;
  tempC100: number | null;
  rhX100: number | null;
  tvocPpb: number | null;
  eco2Ppm: number | null;
  aqiUba: number | null;
  gasStatus: number | null;
  battMv: number | null;
  flags: number;
  /** Número da ligada em que a leitura foi medida, se o nó informar (FR-001). */
  ligada?: number | null;
  /**
   * O valor em ponto flutuante como o nó mandou (feature 005, D-509), quando o
   * formato traz float. `tempC100`/`rhX100` são derivados dele para os resumos;
   * o bruto fica guardado para recomputar. Ausente nos formatos inteiros.
   */
  tempBruto?: number | null;
  rhBruto?: number | null;
}

export interface ClockAnchor {
  deviceId: string;
  bootId: string | null;
  tNodeAtAnchor: number;
  tUtcAtAnchorMs: number;
  monoMs: number;
  rttMs: number;
  src: TransportKind;
  trusted: boolean;
}

export type PreflightId =
  | 'bluetooth-ligado'
  | 'localizacao-ligada'
  | 'permissao-concedida'
  | 'cabo-conectado'
  | 'armazenamento-disponivel'
  | 'fonte-simulada';

export interface PreflightItem {
  id: PreflightId;
  ok: boolean;
  /** Já em pt-BR. A tela de diagnóstico é renderização pura desta lista. */
  label: string;
  hint?: string;
  fixAction?: () => Promise<void>;
}

export interface DiscoveredNode {
  transport: TransportKind;
  /** Identificador local do transporte. NÃO é a identidade do nó. */
  handle: string;
  deviceId?: string;
  rssi?: number;
  hint?: { pendingRecords?: number; battMv?: number; protoVer?: number };
}

export interface PullProgress {
  received: number;
  total?: number;
  lastSeq: number;
}

export type SetTimeResult =
  | { ok: true }
  | {
      ok: false;
      /**
       *  - `unsupported`: o nó não sabe receber hora.
       *  - `rejected`:    o nó recebeu e recusou.
       *  - `no-reply`:    o nó não respondeu.
       */
      reason: 'unsupported' | 'rejected' | 'no-reply';
    };

export interface NodeSession {
  readonly transport: TransportKind;
  readonly info: NodeInfo;
  readonly anchor: ClockAnchor;

  /**
   * Envia ao nó a hora do celular, em ms desde 1970 UTC. Só UTC: fuso horário
   * é assunto do celular, e hora local nunca atravessa a fronteira.
   *
   * Melhor esforço: a coleta NUNCA depende disto. Falhar aqui não impede a
   * transferência — a hora das leituras sai da âncora do celular, não do nó.
   * Quem chama deve impor um limite de tempo; o transporte também.
   *
   * A hora enviada serve ao relógio do nó. Ela NÃO decide o que já foi
   * coletado: isso é pelo número da leitura (`seq`), que não depende de hora.
   */
  setTime(unixMs: number): Promise<SetTimeResult>;

  /**
   * AsyncIterable, nunca Promise<Reading[]>. Isso IMPEDE POR CONSTRUÇÃO que
   * centenas de milhares de leituras sejam materializadas na memória de um
   * aparelho de 2 GB, e força o commit incremental que dá a retomada de graça.
   */
  pullReadings(
    afterSeq: number,
    opts?: { signal?: AbortSignal; onProgress?: (p: PullProgress) => void },
  ): AsyncIterable<Reading[]>;

  close(): Promise<void>;
}

export interface Transport {
  readonly kind: TransportKind;
  isSupported(): Promise<{ ok: true } | { ok: false; reason: UnsupportedReason }>;
  preflight(): Promise<PreflightItem[]>;
  discover(opts?: { timeoutMs?: number; deviceId?: string }): AsyncIterable<DiscoveredNode>;
  connect(node: DiscoveredNode, opts?: { signal?: AbortSignal }): Promise<NodeSession>;
}
