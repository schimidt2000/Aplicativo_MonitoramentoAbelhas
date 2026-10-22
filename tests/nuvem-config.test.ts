/**
 * Qual nuvem o app usa, e o que ele se recusa a usar.
 *
 * O caso que importa: uma chave com privilégio administrativo colada por
 * engano no build. Ela ignora a RLS — o teste de negação do servidor deixaria
 * de valer para o app inteiro. O app recusa e cai na nuvem simulada (FR-023).
 */
import { describe, expect, it } from 'vitest';
import { criarNuvem, ehNuvemSimulada } from '@/nuvem';
import { ehChaveDeServico, lerConfigNuvem } from '@/nuvem/config';

function jwt(corpo: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(corpo)}.assinatura`;
}

const ANON = jwt({ iss: 'supabase', role: 'anon', ref: 'bee' });
const SERVICO = jwt({ iss: 'supabase', role: 'service_role', ref: 'bee' });

describe('configuração da nuvem', () => {
  it('sem variáveis, é "ausente" (usa a simulada sem alarde)', () => {
    expect(lerConfigNuvem({})).toEqual({ ok: false, motivo: 'ausente' });
    expect(lerConfigNuvem({ url: 'https://x.supabase.co' })).toEqual({ ok: false, motivo: 'ausente' });
  });

  it('aceita chave pública nos dois formatos', () => {
    for (const chave of [ANON, 'sb_publishable_abc123']) {
      const r = lerConfigNuvem({ url: 'https://bee.supabase.co/', chave });
      expect(r).toEqual({ ok: true, config: { url: 'https://bee.supabase.co', chavePublica: chave } });
    }
  });

  it('RECUSA chave de serviço, nos dois formatos', () => {
    expect(lerConfigNuvem({ url: 'https://bee.supabase.co', chave: SERVICO }))
      .toEqual({ ok: false, motivo: 'chave-de-servico' });
    expect(lerConfigNuvem({ url: 'https://bee.supabase.co', chave: 'sb_secret_abc' }))
      .toEqual({ ok: false, motivo: 'chave-de-servico' });
    expect(ehChaveDeServico('aaa.@@@.bbb')).toBe(true); // parece JWT e não lê: recusa
  });

  it('RECUSA endereço sem TLS, exceto o Supabase local de desenvolvimento', () => {
    expect(lerConfigNuvem({ url: 'http://bee.supabase.co', chave: ANON }))
      .toEqual({ ok: false, motivo: 'sem-tls' });
    expect(lerConfigNuvem({ url: 'http://127.0.0.1:54321', chave: ANON }).ok).toBe(true);
    expect(lerConfigNuvem({ url: 'não é endereço', chave: ANON }))
      .toEqual({ ok: false, motivo: 'endereco-invalido' });
  });
});

describe('registro da nuvem', () => {
  it('sem configuração, escolhe a simulada', () => {
    expect(ehNuvemSimulada(criarNuvem({}))).toBe(true);
  });

  it('com configuração válida, escolhe a real', () => {
    const n = criarNuvem({ url: 'https://bee.supabase.co', chave: ANON });
    expect(n.nome).toBe('supabase');
    expect(ehNuvemSimulada(n)).toBe(false);
  });

  it('configuração recusada cai na simulada e avisa, sem vazar a chave', () => {
    const avisos: string[] = [];
    const n = criarNuvem(
      { url: 'https://bee.supabase.co', chave: SERVICO },
      { avisar: (m) => avisos.push(m) },
    );
    expect(ehNuvemSimulada(n)).toBe(true);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('chave-de-servico');
    expect(avisos[0]).not.toContain(SERVICO);
  });
});
