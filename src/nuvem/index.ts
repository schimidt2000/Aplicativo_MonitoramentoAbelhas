/**
 * Registro da nuvem. A UI importa daqui e nunca de uma implementação — mesmo
 * padrão do registro de transporte (Princípio IV).
 *
 * Escolha:
 *  - EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY presentes e
 *    válidas -> nuvem real (src/nuvem/supabase/);
 *  - qualquer outra coisa -> nuvem simulada. É o padrão enquanto não há conta
 *    de nuvem, e é o que roda na demonstração.
 *
 * Uma configuração RECUSADA (chave de serviço, endereço sem TLS) também cai na
 * simulada, com um aviso no console de desenvolvimento — nunca na real com a
 * chave errada.
 */
import type { ClienteNuvem } from '@/core/ports/nuvem';
import { envDoExpo, lerConfigNuvem, type EnvNuvem } from './config';
import { NuvemMock } from './mock/cliente';
import { cofreEmMemoria, type Cofre } from './supabase/cofre';
import { NuvemSupabase } from './supabase/cliente';

export interface DependenciasNuvem {
  cofre?: Cofre;
  fetch?: typeof fetch;
  avisar?: (mensagem: string) => void;
}

export function criarNuvem(env: EnvNuvem, deps: DependenciasNuvem = {}): ClienteNuvem {
  const lida = lerConfigNuvem(env);
  if (!lida.ok) {
    if (lida.motivo !== 'ausente') {
      (deps.avisar ?? console.warn)(
        `[nuvem] configuração recusada (${lida.motivo}); usando a nuvem simulada`,
      );
    }
    return new NuvemMock();
  }
  return new NuvemSupabase({
    config: lida.config,
    cofre: deps.cofre ?? cofreEmMemoria(),
    fetch: deps.fetch,
  });
}

let instancia: ClienteNuvem | null = null;

export function obterNuvem(): ClienteNuvem {
  if (!instancia) instancia = criarNuvem(envDoExpo());
  return instancia;
}

/** A tela de vínculo só mostra o código de demonstração na nuvem simulada. */
export function ehNuvemSimulada(nuvem: ClienteNuvem): boolean {
  return nuvem.nome === 'simulada';
}

export { CODIGO_DEMO } from './mock/cliente';
