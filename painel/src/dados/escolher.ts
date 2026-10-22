/**
 * Escolhe a fonte de dados. Sem configuração, demonstração. Com
 * `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, o servidor do projeto.
 *
 * As duas fontes entram por import dinâmico: no modo real o código da
 * demonstração não vai para o navegador, e no modo demonstração o SDK do
 * servidor também não.
 *
 * A chave anônima é pública por desenho (o acesso é decidido pela RLS no
 * servidor). Chave de serviço NUNCA entra aqui (constituição, Restrições).
 */
import { diaDeMs } from '../dominio/calendario';
import type { FontePainel } from './porta';

export class ConfiguracaoInsegura extends Error {}

/** TLS obrigatório (constituição); http só para servidor local de desenvolvimento. */
export function enderecoAceito(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function escolherFonte(): Promise<FontePainel> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && chave) {
    if (!enderecoAceito(url)) throw new ConfiguracaoInsegura();
    const { criarFonteSupabase } = await import('./supabase');
    return criarFonteSupabase(url, chave);
  }
  const { criarFonteDemo } = await import('./demo');
  return criarFonteDemo(diaDeMs(Date.now()));
}
