/**
 * Motor de envio. Onde o Princípio I e o Princípio III viram código do lado
 * do cliente.
 *
 * Garantias, e como cada uma é obtida:
 *
 *  - NADA SE PERDE. `synced_at` só é gravado depois que a nuvem confirma. Cair
 *    entre a confirmação e o commit reenvia o lote, e o servidor ignora por
 *    chave natural. Não existe estado em que uma leitura suma.
 *  - NADA DUPLICA. A chave `(deviceId, seq)` é a mesma nos dois lados, e o
 *    servidor grava com "não faça nada em conflito".
 *  - NADA É APAGADO. Este arquivo não tem um único DELETE.
 *  - RETOMA. A fila é o índice parcial `ix_reading_unsynced`; o "cursor" é o
 *    próprio estado do banco, então retomar é só consultar de novo.
 *
 * Ordem das fases importa: o cadastro sobe ANTES das leituras, porque a
 * política do servidor exige que o nó já exista para aceitar leitura dele.
 * Inverter produz um 403 que é fácil de ler como problema de autenticação.
 */
import type { ClienteNuvem, MotivoFalha } from '@/core/ports/nuvem';
import type { SqlDb } from './types';
import {
  cadastroAlteradoDesde, gravarConfig, lerConfig, loteNaoEnviado, marcarEnviadas,
  proximoNoComPendentes, totalPendentes,
} from './repo';

const CHAVE_CURSOR_CADASTRO = 'cursor_cadastro_ms';
/** O tamanho do lote sobrevive entre envios: a rede de ontem é a de hoje (T061). */
const CHAVE_LOTE = 'envio_tamanho_lote';

/** Lote inicial. Adaptado em campo conforme a rede responde. */
export const LOTE_INICIAL = 100;
export const LOTE_MIN = 25;
export const LOTE_MAX = 500;
/** Novas tentativas, dentro do mesmo envio, para falha passageira (T061). */
export const TENTATIVAS_POR_ENVIO = 3;

export interface ProgressoEnvio {
  enviadas: number;
  restantes: number;
}

export interface ResumoEnvio {
  enviadas: number;
  restantes: number;
  parou: MotivoFalha | null;
}

export interface OpcoesEnvio {
  aoProgredir?: (p: ProgressoEnvio) => void;
  sinal?: AbortSignal;
  /** Teto de leituras nesta execução. Sem teto, envia até acabar. */
  maximo?: number;
  /** A espera entre tentativas. Injetável: os testes não esperam de verdade. */
  esperar?: (ms: number) => Promise<void>;
}

const esperarDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function loteGuardado(db: SqlDb): number {
  const n = Number(lerConfig(db, CHAVE_LOTE, String(LOTE_INICIAL)));
  return Number.isFinite(n) ? Math.min(LOTE_MAX, Math.max(LOTE_MIN, Math.floor(n))) : LOTE_INICIAL;
}

function guardarLote(db: SqlDb, n: number) {
  try { gravarConfig(db, CHAVE_LOTE, String(n)); } catch { /* conveniência */ }
}

/**
 * Falhas passageiras: vale tentar de novo AGORA, com espera. Sem rede e portal
 * cativo não passam com espera de segundos: o envio para e a pessoa tenta
 * depois. As demais exigem ação da pessoa (código, vínculo).
 */
function passageira(m: MotivoFalha): boolean {
  return m === 'servidor' || m === 'tempo-esgotado';
}

/**
 * Envia tudo que estiver pendente. Não lança: devolve o motivo de ter parado,
 * porque "parou" é situação normal neste app, não exceção.
 */
export async function enviarPendentes(
  db: SqlDb, nuvem: ClienteNuvem, opts: OpcoesEnvio = {},
): Promise<ResumoEnvio> {
  let enviadas = 0;
  const restantes = () => totalPendentes(db);

  const conexao = await nuvem.verificarConexao();
  if (!conexao.ok) return { enviadas, restantes: restantes(), parou: conexao.motivo };

  if (!(await nuvem.vinculoAtual())) {
    return { enviadas, restantes: restantes(), parou: 'sem-vinculo' };
  }

  // Fase 1 — cadastro. Precisa existir antes da leitura que o referencia.
  // A marca é tirada ANTES de ler o cadastro: o que for gravado enquanto o
  // pedido espera a rede fica acima do cursor novo e sobe no próximo envio.
  // Tirada depois da resposta, ela pularia essas linhas para sempre. O `- 1`
  // reenvia, no máximo, o que caiu no mesmo milissegundo — inofensivo, porque
  // o servidor aplica última escrita vence.
  const marca = Date.now();
  const cursor = Number(lerConfig(db, CHAVE_CURSOR_CADASTRO, '0'));
  const cadastro = cadastroAlteradoDesde(db, cursor);
  const temCadastro = cadastro.apiarios.length + cadastro.colmeias.length
                    + cadastro.nos.length > 0;
  const esperar = opts.esperar ?? esperarDeVerdade;
  if (temCadastro) {
    let r = await nuvem.enviarCadastro(cadastro);
    for (let t = 0; !r.ok && passageira(r.motivo) && t < TENTATIVAS_POR_ENVIO
         && !opts.sinal?.aborted; t++) {
      await esperar(atrasoDeRetentativa(t));
      r = await nuvem.enviarCadastro(cadastro);
    }
    if (!r.ok) return { enviadas, restantes: restantes(), parou: r.motivo };
    gravarConfig(db, CHAVE_CURSOR_CADASTRO, String(Math.max(cursor, marca - 1)));
  }

  // Fase 2 — leituras, um nó por vez.
  // Lote adaptativo (sync.md): dois esgotamentos de tempo seguidos reduzem pela
  // metade, três sucessos dobram, e o tamanho fica guardado para o próximo envio.
  let tamanhoLote = loteGuardado(db);
  let sucessosSeguidos = 0;
  let tempoEsgotadoSeguidos = 0;
  let tentativa = 0;
  // Nó que o servidor recusou fica de fora SÓ nesta execução: os outros nós
  // seguem (achado A-4, T062), e o próximo envio tenta esse nó de novo.
  const recusados: number[] = [];

  for (;;) {
    if (opts.sinal?.aborted) break;
    if (opts.maximo !== undefined && enviadas >= opts.maximo) break;

    const nodeId = proximoNoComPendentes(db, recusados);
    if (nodeId === null) break;

    const limite = opts.maximo !== undefined
      ? Math.min(tamanhoLote, opts.maximo - enviadas)
      : tamanhoLote;
    const lote = loteNaoEnviado(db, nodeId, limite);
    if (lote.length === 0) break;

    const r = await nuvem.enviarLeituras(lote);

    if (!r.ok) {
      sucessosSeguidos = 0;
      if (r.motivo === 'tempo-esgotado') {
        tempoEsgotadoSeguidos += 1;
        if (tempoEsgotadoSeguidos >= 2) {
          // Rede ruim pede lote menor, não desistência.
          tamanhoLote = Math.max(LOTE_MIN, Math.floor(tamanhoLote / 2));
          tempoEsgotadoSeguidos = 0;
          guardarLote(db, tamanhoLote);
        }
      }
      if (passageira(r.motivo) && tentativa < TENTATIVAS_POR_ENVIO && !opts.sinal?.aborted) {
        // Recuo exponencial com jitter total. Nunca desistir para sempre: o que
        // sobrar fica para o próximo envio, pela fila de não enviadas.
        await esperar(atrasoDeRetentativa(tentativa));
        tentativa += 1;
        continue;
      }
      if (r.motivo === 'recusado') {
        recusados.push(nodeId);
        tentativa = 0;
        continue;
      }
      return { enviadas, restantes: restantes(), parou: r.motivo };
    }
    tentativa = 0;
    tempoEsgotadoSeguidos = 0;

    // Confirmação numa transação. Se o processo morrer aqui, o lote é
    // reenviado e o servidor ignora — nunca se perde, nunca duplica.
    const primeiro = lote[0].seq;
    const ultimo = lote[lote.length - 1].seq;
    db.transaction(() => {
      marcarEnviadas(db, nodeId, primeiro, ultimo, Date.now());
    });

    enviadas += lote.length;
    opts.aoProgredir?.({ enviadas, restantes: restantes() });

    sucessosSeguidos += 1;
    if (sucessosSeguidos >= 3) {
      tamanhoLote = Math.min(LOTE_MAX, tamanhoLote * 2);
      sucessosSeguidos = 0;
      guardarLote(db, tamanhoLote);
    }
  }

  // Se a gravação falhar, só as marcas de "enviada" se perdem: o próximo envio
  // repete esses lotes e o servidor ignora a repetição. Nenhuma leitura some,
  // então isto não vira aviso — ao contrário da coleta (`coleta.ts`).
  try {
    await db.persist();
  } catch { /* reenvio idempotente cobre */ }
  return { enviadas, restantes: restantes(), parou: recusados.length ? 'recusado' : null };
}

/**
 * Espera com recuo exponencial e jitter TOTAL — sorteio uniforme entre 0 e o
 * atraso calculado, não o atraso em si. Sem o jitter, todos os celulares de um
 * povoado que perderam sinal juntos retentam no mesmo instante.
 */
export function atrasoDeRetentativa(tentativa: number, aleatorio = Math.random): number {
  const teto = Math.min(5 * 60_000, 1000 * 2 ** Math.min(tentativa, 10));
  return Math.floor(aleatorio() * teto);
}
