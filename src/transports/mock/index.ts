/**
 * Transporte simulado. O Princípio IV exige que ele exista ANTES de qualquer
 * transporte real e seja a base dos testes — sem ele, os caminhos de falha,
 * que são o ponto inteiro de um app offline-first, nunca são exercitados.
 *
 * Este é o ÚNICO lugar (junto de src/transports/) autorizado a conhecer
 * detalhes de transporte. Domínio e UI nunca importam daqui.
 */
import {
  TransportError,
  type ClockAnchor, type DiscoveredNode, type NodeInfo, type NodeSession,
  type PreflightItem, type PullProgress, type Reading, type SetTimeResult,
  type Transport,
} from '@/core/ports/transport';
import { decode } from '@/core/decode';
import { t } from '@/core/i18n';
import { encodeV1 } from '@/core/decode/v1';
import {
  PERFIL_FRACO, PERFIL_QUENTE, PERFIL_SAUDAVEL, type PerfilColmeia, gerarSerie,
} from './gerador';

/** Falhas injetáveis — cada uma corresponde a uma linha da tabela em contracts/transport.md. */
export interface FalhasSimuladas {
  /**
   * Interrompe a transferência nesta fração (0..1). Se não há nada pendente, a
   * conexão ainda pode cair: simulamos a queda logo no início.
   */
  quedaEm?: number;
  /** O nó reiniciou desde a última visita: bootId muda. */
  reiniciouNoMeio?: boolean;
  /** Anuncia uma versão de protocolo que não sabemos decodificar. */
  versaoDesconhecida?: number;
  /** O primeiro quadro chega truncado (tamanho que não é múltiplo do registro). */
  quadroCorrompido?: boolean;
  /** O nó não sabe receber hora (firmware antigo). */
  semSuporteHorario?: boolean;
  /** O nó recebe a hora do celular e a recusa. */
  horarioRecusado?: boolean;
  /** O nó não responde ao acerto de hora. */
  semRespostaHorario?: boolean;
  /**
   * O nó não tem noção de tempo nenhuma: nem contador relativo. Cada leitura
   * chega com contador 0 e `clockMode: 'none'`; a hora fica em branco (FR-016).
   */
  semNocaoDeTempo?: boolean;
  /**
   * A placa perdeu energia e religou no meio da série (fração 0..1 das leituras
   * que o nó tem): dali em diante o contador recomeça do zero (feature 003).
   * Vale no modo sem linha do tempo.
   */
  perdeuEnergiaEm?: number;
  /** O mesmo, num instante do relógio REAL. Vale no modo com `ligadoEmMs`. */
  perdeuEnergiaEmMs?: number;
}

export interface ConfigNoSimulado {
  deviceId: string;
  nome: string;
  perfil: PerfilColmeia;
  /**
   * Sem `ligadoEmMs`: quantos dias de leituras o nó tem, e a última é "agora".
   * Com `ligadoEmMs`: quantos dias cabem na memória do nó (os mais recentes).
   */
  dias: number;
  /**
   * Linha do tempo fixa (feature 003, D-310): o nó ligou neste instante do
   * relógio REAL e mede desde então. O contador na conexão é o tempo desde que
   * ligou, independente do relógio do celular — que pode estar errado. Sem isto,
   * cada conexão reinventa a história do nó, e duas coletas em dias diferentes
   * discordariam sem que nada estivesse errado.
   */
  ligadoEmMs?: number;
  periodoS: number;
  seed: number;
  comLacunas?: boolean;
  comInvalidas?: boolean;
  falhas?: FalhasSimuladas;
}

/**
 * Instante em que as colmeias de demonstração "ligaram". Fixo, para que a
 * semente e as coletas de demonstração, feitas em dias diferentes, contem a
 * mesma história.
 */
export const DEMO_LIGADO_EM_MS = Date.UTC(2026, 8, 1, 12, 0, 0);

export const NOS_DEMO: ConfigNoSimulado[] = [
  {
    deviceId: 'A1B2C3D4E5F60001', nome: 'Colmeia 07', perfil: PERFIL_QUENTE,
    dias: 60, periodoS: 900, seed: 7, comLacunas: true, comInvalidas: true,
    ligadoEmMs: DEMO_LIGADO_EM_MS,
  },
  {
    deviceId: 'A1B2C3D4E5F60002', nome: 'Colmeia 03', perfil: PERFIL_SAUDAVEL,
    dias: 60, periodoS: 900, seed: 3, comInvalidas: true,
    ligadoEmMs: DEMO_LIGADO_EM_MS,
  },
  {
    deviceId: 'A1B2C3D4E5F60003', nome: 'Colmeia 11', perfil: PERFIL_FRACO,
    dias: 60, periodoS: 900, seed: 11, comLacunas: true, comInvalidas: true,
    ligadoEmMs: DEMO_LIGADO_EM_MS,
  },
];

/** Um sensor que o app não tem cadastrado: para mostrar o aviso de sensor desconhecido. */
export const NO_DESCONHECIDO: ConfigNoSimulado = {
  deviceId: 'A1B2C3D4E5F69999', nome: 'Colmeia nova', perfil: PERFIL_SAUDAVEL,
  dias: 2, periodoS: 900, seed: 99,
};

/** Quantos registros cabem num lote. O tamanho real virá do MTU negociado. */
const REGISTROS_POR_LOTE = 60;

export interface AtrasosSimulados {
  descoberta: number;
  conexao: number;
  lote: number;
  horario: number;
}

/** Ritmo parecido com o de um sensor de verdade, para a demonstração. */
export const ATRASOS_REALISTAS: AtrasosSimulados = {
  descoberta: 220, conexao: 320, lote: 4, horario: 120,
};

/** Para testes: nenhuma espera. */
export const SEM_ATRASOS: AtrasosSimulados = {
  descoberta: 0, conexao: 0, lote: 0, horario: 0,
};

const esperar = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * O que o nó tem na memória no instante `realMs` do relógio real, e o valor do
 * contador dele nesse instante.
 */
export function serieDoNo(
  cfg: ConfigNoSimulado, realMs: number,
): { serie: Reading[]; contadorAgora: number } {
  const f = cfg.falhas ?? {};
  const base = {
    periodoS: cfg.periodoS, perfil: cfg.perfil, seed: cfg.seed,
    comLacunas: cfg.comLacunas, comInvalidas: cfg.comInvalidas, semTempo: f.semNocaoDeTempo,
  };

  if (cfg.ligadoEmMs === undefined) {
    const total = cfg.dias * Math.floor(86400 / cfg.periodoS);
    const reinicioEm = f.perdeuEnergiaEm !== undefined
      ? Math.floor(total * f.perdeuEnergiaEm) : undefined;
    const serie = gerarSerie({ ...base, dias: cfg.dias, reinicioEm });
    // Modo antigo, só dos testes: a última leitura corresponde a "agora". O
    // contrato (adendo 003) pede o contador DO INSTANTE; aqui a diferença é de
    // até um período, e os testes deste modo não dependem dela.
    return { serie, contadorAgora: f.semNocaoDeTempo ? 0 : serie[serie.length - 1].tNode };
  }

  const periodoMs = cfg.periodoS * 1000;
  const total = Math.floor(Math.max(0, realMs - cfg.ligadoEmMs) / periodoMs) + 1;
  let reinicioEm: number | undefined;
  if (f.perdeuEnergiaEmMs !== undefined) {
    const i = Math.ceil((f.perdeuEnergiaEmMs - cfg.ligadoEmMs) / periodoMs);
    if (i > 0 && i < total) reinicioEm = i;
  }
  const completa = gerarSerie({ ...base, dias: cfg.dias, quantidade: total, reinicioEm });
  const naMemoria = Math.max(1, cfg.dias * Math.floor(86400 / cfg.periodoS));
  // O contador conta desde a última vez que o nó ligou, não desde a última leitura.
  const ligouEm = cfg.ligadoEmMs + (reinicioEm ?? 0) * periodoMs;
  return {
    serie: completa.slice(-naMemoria),
    contadorAgora: f.semNocaoDeTempo ? 0 : Math.floor((realMs - ligouEm) / 1000),
  };
}

class MockSession implements NodeSession {
  readonly transport = 'mock' as const;
  readonly info: NodeInfo;
  readonly anchor: ClockAnchor;
  private readonly serie: Reading[];
  private readonly falhas: FalhasSimuladas;

  constructor(
    cfg: ConfigNoSimulado,
    agoraMs: number,
    realMs: number,
    monoMs: number,
    private readonly atrasos: AtrasosSimulados,
    private readonly relogiosRecebidos: Map<string, number>,
  ) {
    const { serie, contadorAgora } = serieDoNo(cfg, realMs);
    this.serie = serie;
    this.falhas = cfg.falhas ?? {};

    const ultima = this.serie[this.serie.length - 1];
    const bootId = this.falhas.reiniciouNoMeio ? 'b0000002' : 'b0000001';

    this.info = {
      protoVer: this.falhas.versaoDesconhecida ?? 1,
      deviceId: cfg.deviceId,
      bootId,
      fwVersion: '0.1.0-sim',
      // O nó simulado não tem relógio: só conta. É o caso realista.
      clockMode: this.falhas.semNocaoDeTempo ? 'none' : 'uptime',
      caps: { setTime: !this.falhas.semSuporteHorario },
      oldestSeq: this.serie[0].seq,
      newestSeq: ultima.seq,
      recordCount: this.serie.length,
      samplePeriodS: cfg.periodoS,
      battMv: ultima.battMv,
    };

    // Âncora: o contador do nó agora × a hora do CELULAR agora. É o par que
    // permite reconstruir a hora das leituras a partir do contador.
    this.anchor = {
      deviceId: cfg.deviceId,
      bootId,
      tNodeAtAnchor: contadorAgora,
      tUtcAtAnchorMs: agoraMs,
      monoMs,
      rttMs: 0,
      src: 'mock',
      trusted: true,
    };
  }

  async setTime(unixMs: number): Promise<SetTimeResult> {
    if (!this.info.caps.setTime) return { ok: false, reason: 'unsupported' };
    await esperar(this.atrasos.horario);
    if (this.falhas.horarioRecusado) return { ok: false, reason: 'rejected' };
    if (this.falhas.semRespostaHorario) return { ok: false, reason: 'no-reply' };
    this.relogiosRecebidos.set(this.info.deviceId, unixMs);
    return { ok: true };
  }

  async *pullReadings(
    afterSeq: number,
    opts?: { signal?: AbortSignal; onProgress?: (p: PullProgress) => void },
  ): AsyncIterable<Reading[]> {
    const pendentes = this.serie.filter((r) => r.seq > afterSeq);
    const total = pendentes.length;
    const queda = this.falhas.quedaEm;
    const pararEm = queda !== undefined ? Math.floor(total * queda) : total;

    // Sem nada pendente não há transferência para interromper, mas a conexão
    // ainda pode cair, e a demonstração precisa mostrar isso em qualquer estado.
    if (queda !== undefined && total === 0) {
      throw new TransportError('connection-lost', 'queda simulada logo no início');
    }
    // Mesma ideia para o quadro com defeito: sem lote, o defeito está no cabeçalho.
    if (this.falhas.quadroCorrompido && total === 0) {
      decode(this.info.protoVer, encodeV1([], 0).slice(0, 3)); // lança QuadroInvalidoError
    }

    let enviados = 0;
    for (let i = 0; i < pendentes.length; i += REGISTROS_POR_LOTE) {
      if (opts?.signal?.aborted) return;
      if (enviados >= pararEm) {
        throw new TransportError('connection-lost', 'queda simulada na transferência');
      }

      const lote = pendentes.slice(i, i + REGISTROS_POR_LOTE);

      // O caminho real: codifica, transmite bytes, decodifica. Exercita o
      // decodificador de verdade em vez de entregar objetos prontos.
      let bytes = encodeV1(lote, i / REGISTROS_POR_LOTE);
      if (this.falhas.quadroCorrompido && i === 0) {
        bytes = bytes.slice(0, bytes.length - 3);
      }
      const decodificado = decode(this.info.protoVer, bytes);

      enviados += decodificado.length;
      opts?.onProgress?.({
        received: enviados,
        total,
        lastSeq: decodificado[decodificado.length - 1]?.seq ?? afterSeq,
      });

      yield decodificado;
      await esperar(this.atrasos.lote);
    }
  }

  async close() {
    /* nada a liberar no simulado */
  }
}

export class MockTransport implements Transport {
  readonly kind = 'mock' as const;
  private readonly atrasos: AtrasosSimulados;
  /** Relógio do CELULAR: vai para a âncora e pode estar errado. */
  private readonly agora: () => number;
  /** Relógio do mundo: decide o que o nó mediu até agora (modo linha do tempo). */
  private readonly real: () => number;
  /** deviceId -> última hora (ms UTC) que o nó simulado recebeu do celular. */
  private readonly relogios = new Map<string, number>();

  constructor(
    private readonly nos: ConfigNoSimulado[] = NOS_DEMO,
    opcoes: {
      atrasos?: AtrasosSimulados; agora?: () => number; relogioReal?: () => number;
    } = {},
  ) {
    this.atrasos = opcoes.atrasos ?? ATRASOS_REALISTAS;
    this.agora = opcoes.agora ?? Date.now;
    this.real = opcoes.relogioReal ?? Date.now;
  }

  /** Para inspeção em testes e na demonstração: o que o nó recebeu do celular. */
  horarioRecebido(deviceId: string): number | undefined {
    return this.relogios.get(deviceId);
  }

  async isSupported() {
    return { ok: true } as const;
  }

  async preflight(): Promise<PreflightItem[]> {
    return [
      {
        id: 'fonte-simulada',
        ok: true,
        // Rótulos vêm do i18n: a tela de diagnóstico os desenha como chegam.
        label: t('diagnostico.preflight.simulado'),
        hint: t('diagnostico.preflight.simulado.dica'),
      },
      {
        id: 'armazenamento-disponivel',
        ok: true,
        label: t('diagnostico.preflight.armazenamento'),
      },
    ];
  }

  async *discover(opts?: { timeoutMs?: number; deviceId?: string }): AsyncIterable<DiscoveredNode> {
    const alvo = opts?.deviceId
      ? this.nos.filter((n) => n.deviceId === opts.deviceId)
      : this.nos;

    for (const n of alvo) {
      await esperar(this.atrasos.descoberta);
      const { serie } = serieDoNo(n, this.real());
      yield {
        transport: 'mock',
        handle: `mock:${n.deviceId}`,
        deviceId: n.deviceId,
        rssi: -55 - Math.floor(serie.length % 20),
        hint: {
          pendingRecords: serie.length,
          battMv: serie[serie.length - 1].battMv ?? undefined,
          protoVer: n.falhas?.versaoDesconhecida ?? 1,
        },
      };
    }
  }

  async connect(node: DiscoveredNode): Promise<NodeSession> {
    const cfg = this.nos.find((n) => n.deviceId === node.deviceId);
    if (!cfg) throw new TransportError('not-found', 'nó não está na lista simulada');
    await esperar(this.atrasos.conexao);
    return new MockSession(
      cfg, this.agora(), this.real(), Math.round(performance.now()), this.atrasos, this.relogios,
    );
  }
}

export { gerarSerie, PERFIL_SAUDAVEL, PERFIL_QUENTE, PERFIL_FRACO };
export type { PerfilColmeia };
