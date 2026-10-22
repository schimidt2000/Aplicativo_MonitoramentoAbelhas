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

/** Lote inicial. Adaptado em campo conforme a rede responde. */
const LOTE_INICIAL = 100;
const LOTE_MIN = 25;
const LOTE_MAX = 500;

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
}

/** Falhas que valem retentar depois; as outras exigem ação da pessoa. */
function vaieTentarDepois(m: MotivoFalha): boolean {
  return m === 'sem-rede' || m === 'portal-cativo' || m === 'servidor'
      || m === 'tempo-esgotado';
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
  if (temCadastro) {
    const r = await nuvem.enviarCadastro(cadastro);
    if (!r.ok) return { enviadas, restantes: restantes(), parou: r.motivo };
    gravarConfig(db, CHAVE_CURSOR_CADASTRO, String(Math.max(cursor, marca - 1)));
  }

  // Fase 2 — leituras, um nó por vez.
  let tamanhoLote = LOTE_INICIAL;
  let sucessosSeguidos = 0;

  for (;;) {
    if (opts.sinal?.aborted) break;
    if (opts.maximo !== undefined && enviadas >= opts.maximo) break;

    const nodeId = proximoNoComPendentes(db);
    if (nodeId === null) break;

    const limite = opts.maximo !== undefined
      ? Math.min(tamanhoLote, opts.maximo - enviadas)
      : tamanhoLote;
    const lote = loteNaoEnviado(db, nodeId, limite);
    if (lote.length === 0) break;

    const r = await nuvem.enviarLeituras(lote);

    if (!r.ok) {
      if (vaieTentarDepois(r.motivo)) {
        // Lote adaptativo: rede ruim pede lote menor, não desistência.
        tamanhoLote = Math.max(LOTE_MIN, Math.floor(tamanhoLote / 2));
        sucessosSeguidos = 0;
      }
      return { enviadas, restantes: restantes(), parou: r.motivo };
    }

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
    }
  }

  // Se a gravação falhar, só as marcas de "enviada" se perdem: o próximo envio
  // repete esses lotes e o servidor ignora a repetição. Nenhuma leitura some,
  // então isto não vira aviso — ao contrário da coleta (`coleta.ts`).
  try {
    await db.persist();
  } catch { /* reenvio idempotente cobre */ }
  return { enviadas, restantes: restantes(), parou: null };
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
