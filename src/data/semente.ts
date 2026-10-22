/**
 * Histórico de demonstração.
 *
 * Semeia no CELULAR um histórico que termina há N dias, enquanto o nó simulado
 * segue gravando até agora. Isso reproduz a situação real que o app existe para
 * resolver: o nó nunca para, mas o telefone só tem o que foi coletado na última
 * visita. É o que faz o aviso de coleta atrasada ter sentido — e faz a coleta
 * seguinte preencher exatamente a lacuna.
 *
 * A semente segue a MESMA linha do tempo do nó simulado (`ligadoEmMs`, feature
 * 003): as leituras e a referência de hora são as que uma coleta feita há N
 * dias teria gravado. Assim a primeira coleta de demonstração confere com ela,
 * em qualquer dia, em vez de acusar um conflito de hora que não existe.
 *
 * Roda uma única vez por nó: se já houver leitura, não faz nada.
 */
import { serieDoNo, type ConfigNoSimulado } from '@/transports/mock';
import { ingerirLote } from './ingest';
import { atualizarHoras, gravarReferencia } from './hora';
import { contarLeituras, gravarConfig, lerConfig } from './repo';
import type { FalhaDemo } from '@/core/preferencias';
import type { SqlDb } from './types';

export interface SementeHistorico {
  /** Quantos dias de histórico o celular já tem. */
  dias: number;
  /** Há quantos dias foi a última coleta. 0 = coletado agora. */
  coletadoHaDias: number;
}

const LOTE = 500;

export function semearHistorico(
  db: SqlDb, nodeId: number, no: ConfigNoSimulado, s: SementeHistorico,
  agoraMs = Date.now(),
): void {
  if (contarLeituras(db, nodeId) > 0) return;
  if (no.ligadoEmMs === undefined) return;

  // O instante, no relógio real, da "coleta passada".
  const coletaMs = agoraMs - s.coletadoHaDias * 86400000;
  if (coletaMs <= no.ligadoEmMs) return;

  // O que o nó tinha na memória naquele instante, limitado aos dias da semente.
  const { serie, contadorAgora } = serieDoNo({ ...no, dias: s.dias, falhas: undefined }, coletaMs);
  if (serie.length === 0) return;

  for (let i = 0; i < serie.length; i += LOTE) {
    ingerirLote(db, nodeId, serie.slice(i, i + LOTE), { clockMode: 'uptime' }, 1, 'mock');
  }
  gravarReferencia(db, nodeId, {
    origem: 'semente', bootId: null, ligada: null,
    tNode: contadorAgora, tUtcMs: coletaMs, monoMs: 0, rttMs: 0, src: 'mock',
    aceita: true, seqRef: serie[serie.length - 1].seq, modo: 'uptime', periodoS: no.periodoS,
    criadoMs: agoraMs,
  });
  atualizarHoras(db, nodeId, 'semente', agoraMs);
}

const CHAVE_PERDA_DE_ENERGIA = 'demo_perda_energia_ms';

/**
 * Demonstração "o sensor ficou sem energia ontem e religou" (feature 003). O
 * instante é gravado na primeira vez e vale para sempre, com qualquer outra
 * simulação escolhida depois: a história do nó não pode mudar entre coletas.
 */
export function perdaDeEnergiaDaDemo(
  db: SqlDb, falha: FalhaDemo, agoraMs = Date.now(),
): number | undefined {
  try {
    const guardada = lerConfig(db, CHAVE_PERDA_DE_ENERGIA, '');
    if (guardada !== '') return Number(guardada);
    if (falha !== 'perdeu-energia') return undefined;
    const instante = agoraMs - 86_400_000;
    gravarConfig(db, CHAVE_PERDA_DE_ENERGIA, String(instante));
    return instante;
  } catch {
    // Conveniência de demonstração: sem conseguir guardar, coleta normal.
    return undefined;
  }
}
