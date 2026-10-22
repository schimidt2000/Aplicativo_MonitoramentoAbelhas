/**
 * Registro de transportes. A tela pede "o transporte" daqui e nunca importa uma
 * implementação — mesmo padrão do registro da nuvem (Princípio IV). Quando o BLE
 * real existir, a troca acontece neste arquivo e nenhuma tela muda.
 */
import type { Transport, TransportKind } from '@/core/ports/transport';
import type { FalhaDemo } from '@/core/preferencias';
import type { FalhasDaPlaca } from './mock/firmware';
import {
  MockTransport, NOS_DEMO, NO_DESCONHECIDO,
  type AtrasosSimulados, type ConfigNoSimulado, type FalhasSimuladas,
} from './mock';

/** Hoje só existe o simulado. A tela de Ajustes usa isto para esconder a demonstração. */
export const TRANSPORTE_ATIVO: TransportKind = 'mock';

/** O problema escolhido na demonstração afeta SÓ a primeira colmeia, para mostrar que as outras seguem. */
const FALHAS_POR_DEMO: Record<
  Exclude<FalhaDemo,
    'nenhuma' | 'sem-colmeias' | 'sensor-novo' | 'perdeu-energia' | 'celular-adiantado'>,
  FalhasSimuladas
> = {
  queda: { quedaEm: 0.5 },
  corrompido: { quadroCorrompido: true },
  formato: { versaoDesconhecida: 9 },
  'relogio-recusado': { horarioRecusado: true },
  'sem-nocao-de-tempo': { semNocaoDeTempo: true },
};

const DIA_MS = 86_400_000;

/**
 * O relógio do CELULAR na demonstração. "A data do celular está um ano
 * adiantada" vale para todas as colmeias: a data é do celular, não do sensor.
 */
export function relogioDoCelular(falha: FalhaDemo = 'nenhuma'): () => number {
  return falha === 'celular-adiantado' ? () => Date.now() + 365 * DIA_MS : Date.now;
}

/** Ritmo e relógios do simulado. Só os testes mudam: a tela usa o ritmo realista. */
export interface OpcoesDaDemonstracao {
  /**
   * Instante (relógio real) em que a primeira colmeia de demonstração perdeu
   * energia. Uma vez que aconteceu, vale em TODAS as coletas seguintes, com
   * qualquer outra simulação: falta de energia não "desacontece". Sem isso, a
   * coleta seguinte veria um nó que nunca reiniciou e acusaria um conflito de
   * hora que não existe. Quem guarda o instante é `data/semente.ts`.
   */
  perdaDeEnergiaMs?: number;
  /** Para testes: sem as esperas que imitam um sensor de verdade. */
  atrasos?: AtrasosSimulados;
  /** Para testes: o relógio do celular. Sem ele, vale `relogioDoCelular(falha)`. */
  agora?: () => number;
  /** Para testes: o relógio real, que move a linha do tempo dos nós simulados. */
  relogioReal?: () => number;
}

/** Nome dado pela frente de tela; o mesmo tipo. */
export type OpcoesDoSimulado = OpcoesDaDemonstracao;

export function obterTransporte(
  falha: FalhaDemo = 'nenhuma', opcoes: OpcoesDaDemonstracao = {},
): Transport {
  let nos: ConfigNoSimulado[] = NOS_DEMO;

  if (falha === 'sem-colmeias') {
    nos = [];
  } else if (falha === 'sensor-novo') {
    nos = [...NOS_DEMO, NO_DESCONHECIDO];
  } else if (falha !== 'nenhuma' && falha !== 'celular-adiantado' && falha !== 'perdeu-energia') {
    nos = NOS_DEMO.map((n, i) => (i === 0 ? { ...n, falhas: FALHAS_POR_DEMO[falha] } : n));
  }
  if (opcoes.perdaDeEnergiaMs !== undefined) {
    const perdeuEnergiaEmMs = opcoes.perdaDeEnergiaMs;
    nos = nos.map((n) => (n.deviceId === NOS_DEMO[0].deviceId
      ? { ...n, falhas: { ...n.falhas, perdeuEnergiaEmMs } } : n));
  }
  return new MockTransport(nos, {
    agora: opcoes.agora ?? relogioDoCelular(falha),
    relogioReal: opcoes.relogioReal,
    atrasos: opcoes.atrasos,
  });
}

/**
 * O problema escolhido em Ajustes → Demonstração, na placa simulada do cabo
 * (feature 005). Só os que fazem sentido no cabo; os outros, placa normal.
 */
export function falhasDaPlacaDemo(falha: FalhaDemo = 'nenhuma'): FalhasDaPlaca {
  switch (falha) {
    case 'queda': return { caboPuxadoNaFracao: 0.5 };
    case 'corrompido': return { crcErrado: true };
    case 'relogio-recusado': return { erroNaTroca: 'TEMP_WRITE_FAILED' };
    default: return {};
  }
}

export { placaDeDemonstracao, placaNovaDeDemonstracao, type FalhasDaPlaca } from './mock/firmware';
