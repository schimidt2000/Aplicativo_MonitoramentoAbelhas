/**
 * Um pedido HTTP com prazo, e a tradução de tudo que pode dar errado num
 * `MotivoFalha`. Nunca lança.
 *
 * Por que isto existe em vez de `@supabase/supabase-js`: o app usa dois
 * serviços (Auth e PostgREST) e cinco endereços. O SDK traz junto realtime,
 * storage e functions — peso que um aparelho de 2 GB paga em todo arranque a
 * frio (Princípio II; plan.md, Complexity Tracking).
 */
import type { z } from 'zod';
import type { MotivoFalha } from '@/core/ports/nuvem';

export type Pedido =
  | { ok: true; resposta: Response }
  | { ok: false; motivo: MotivoFalha; detalhe?: string };

export type Lido<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: MotivoFalha; detalhe?: string };

/**
 * Faz o pedido com prazo. Distingue três coisas que o apicultor precisa ouvir
 * de forma diferente:
 *  - não houve resposta nenhuma (sem sinal, DNS, TLS recusado) -> `sem-rede`;
 *  - o prazo acabou -> `tempo-esgotado`;
 *  - a resposta veio de OUTRO endereço (o portal cativo redirecionou) ->
 *    `portal-cativo`.
 */
export async function pedir(
  fazerFetch: typeof fetch,
  url: string,
  init: RequestInit,
  prazoMs: number,
): Promise<Pedido> {
  const controle = new AbortController();
  let estourou = false;
  const relogio = setTimeout(() => { estourou = true; controle.abort(); }, prazoMs);
  try {
    const resposta = await fazerFetch(url, { ...init, signal: controle.signal });
    if (resposta.url && hostDe(resposta.url) !== hostDe(url)) {
      return { ok: false, motivo: 'portal-cativo', detalhe: 'redirecionado' };
    }
    return { ok: true, resposta };
  } catch {
    return estourou
      ? { ok: false, motivo: 'tempo-esgotado' }
      : { ok: false, motivo: 'sem-rede' };
  } finally {
    clearTimeout(relogio);
  }
}

function hostDe(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export function ehJson(r: Response): boolean {
  return (r.headers.get('content-type') ?? '').toLowerCase().includes('application/json');
}

export function ehHtml(r: Response): boolean {
  return (r.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

/**
 * Motivo para um status que não é o esperado. HTML num status de sucesso é a
 * assinatura do portal cativo; o resto segue o significado HTTP.
 */
export function motivoDaResposta(r: Response): MotivoFalha {
  if (ehHtml(r)) return 'portal-cativo';
  if (r.status === 408 || r.status === 429 || r.status >= 500) return 'servidor';
  if (r.status >= 200 && r.status < 300) return 'servidor';
  return 'recusado';
}

/**
 * Lê o corpo como JSON e valida. Qualquer desvio vira motivo, nunca exceção:
 * resposta que o cliente não entende NUNCA é tratada como confirmação.
 */
export async function lerJson<T>(r: Response, esquema: z.ZodType<T>): Promise<Lido<T>> {
  if (!ehJson(r)) return { ok: false, motivo: motivoDaResposta(r), detalhe: 'não é json' };
  let corpo: unknown;
  try {
    corpo = await r.json();
  } catch {
    return { ok: false, motivo: 'servidor', detalhe: 'json ilegível' };
  }
  const v = esquema.safeParse(corpo);
  if (!v.success) return { ok: false, motivo: 'servidor', detalhe: 'formato inesperado' };
  return { ok: true, valor: v.data };
}
