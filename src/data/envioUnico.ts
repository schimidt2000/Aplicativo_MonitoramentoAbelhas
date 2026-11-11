/**
 * Um envio por vez (feature 008, FR-007).
 *
 * O Início envia sozinho ao ganhar foco, e a tela Enviar tem o botão "Enviar
 * agora". Sem este guarda, os dois poderiam mandar o mesmo lote ao mesmo tempo:
 * o servidor ignora a repetição (chave natural), mas é trabalho e dados móveis
 * jogados fora num aparelho fraco. Quem chega com um envio em andamento recebe
 * o resultado desse mesmo envio.
 */
import type { ClienteNuvem } from '@/core/ports/nuvem';
import { enviarPendentes, type OpcoesEnvio, type ResumoEnvio } from './sync';
import type { SqlDb } from './types';

let atual: Promise<ResumoEnvio> | null = null;

/** Há um envio em andamento agora? */
export function enviando(): boolean {
  return atual !== null;
}

/**
 * Começa um envio, ou devolve o que já está em andamento. Não lança, como
 * `enviarPendentes`. As opções (progresso) valem só para quem começou.
 */
export function enviarUmPorVez(
  db: SqlDb, nuvem: ClienteNuvem, opts: OpcoesEnvio = {},
): Promise<ResumoEnvio> {
  if (atual) return atual;
  const esta = enviarPendentes(db, nuvem, opts).finally(() => {
    if (atual === esta) atual = null;
  });
  atual = esta;
  return esta;
}
