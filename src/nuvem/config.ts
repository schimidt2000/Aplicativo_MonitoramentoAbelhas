/**
 * Configuração da nuvem real, lida de variáveis PÚBLICAS do Expo
 * (`EXPO_PUBLIC_*`, embutidas no app na hora do build).
 *
 *   EXPO_PUBLIC_SUPABASE_URL       https://<projeto>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY  a chave PÚBLICA (anon / publishable)
 *
 * Sem as duas, o app usa a nuvem simulada — é o estado padrão enquanto não há
 * conta de nuvem, e a demonstração em sala roda assim.
 *
 * Esta função RECUSA duas configurações perigosas, em vez de confiar em quem
 * monta o build:
 *  - chave com privilégio administrativo (service_role / sb_secret_): ela
 *    ignora a RLS e não pode existir no app (FR-023, constituição);
 *  - endereço sem TLS, exceto o Supabase local de desenvolvimento.
 */

export interface ConfigNuvem {
  /** Sem barra no fim. */
  url: string;
  chavePublica: string;
}

export type ProblemaConfig =
  | 'ausente'
  | 'endereco-invalido'
  | 'sem-tls'
  | 'chave-de-servico';

export type LeituraConfig =
  | { ok: true; config: ConfigNuvem }
  | { ok: false; motivo: ProblemaConfig };

export interface EnvNuvem {
  url?: string;
  chave?: string;
}

/**
 * As variáveis do Expo. O acesso PRECISA ser literal (`process.env.EXPO_PUBLIC_X`)
 * para o Metro substituir pelo valor no build.
 */
export function envDoExpo(): EnvNuvem {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    chave: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
}

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

export function lerConfigNuvem(env: EnvNuvem): LeituraConfig {
  const url = env.url?.trim() ?? '';
  const chave = env.chave?.trim() ?? '';
  if (!url || !chave) return { ok: false, motivo: 'ausente' };

  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    return { ok: false, motivo: 'endereco-invalido' };
  }
  if (endereco.protocol !== 'https:'
      && !(endereco.protocol === 'http:' && HOSTS_LOCAIS.has(endereco.hostname))) {
    return { ok: false, motivo: 'sem-tls' };
  }

  if (ehChaveDeServico(chave)) return { ok: false, motivo: 'chave-de-servico' };

  return {
    ok: true,
    config: { url: `${endereco.origin}${endereco.pathname}`.replace(/\/+$/, ''), chavePublica: chave },
  };
}

/**
 * Chaves do Supabase vêm em dois formatos: JWT (legado; o papel está no campo
 * `role`) e `sb_publishable_` / `sb_secret_`. Só as públicas passam.
 */
export function ehChaveDeServico(chave: string): boolean {
  if (chave.startsWith('sb_secret_')) return true;
  if (chave.startsWith('sb_publishable_')) return false;

  const partes = chave.split('.');
  if (partes.length !== 3) return false;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const corpo = JSON.parse(globalThis.atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return typeof corpo === 'object' && corpo !== null && corpo.role !== 'anon';
  } catch {
    // Parece JWT e não decodifica: na dúvida, recusa.
    return true;
  }
}
