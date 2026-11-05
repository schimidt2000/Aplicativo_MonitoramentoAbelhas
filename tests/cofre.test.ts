/**
 * O cofre do acesso à nuvem (T030, FR-015). No celular, o cofre do sistema
 * lembra o vínculo entre aberturas do app; se ele falhar, a memória segura a
 * sessão atual em vez de travar o envio.
 */
import { describe, expect, it } from 'vitest';
import { cofreProtegido, type CofreDoSistema } from '@/nuvem/supabase/cofre';

function sistemaFalso(o: { quebrado?: boolean } = {}) {
  const dados = new Map<string, string>();
  const falhar = () => { if (o.quebrado) throw new Error('Keystore indisponível'); };
  const sistema: CofreDoSistema = {
    async getItemAsync(k) { falhar(); return dados.get(k) ?? null; },
    async setItemAsync(k, v) { falhar(); dados.set(k, v); },
    async deleteItemAsync(k) { falhar(); dados.delete(k); },
  };
  return { sistema, dados };
}

describe('cofre protegido', () => {
  it('o que foi gravado sobrevive a um app novo (outra instância, mesmo cofre do sistema)', async () => {
    const { sistema } = sistemaFalso();
    await cofreProtegido(sistema).gravar('bee.nuvem.vinculo', '{"x":1}');
    // O app fechou e abriu: memória nova, cofre do sistema o mesmo.
    expect(await cofreProtegido(sistema).ler('bee.nuvem.vinculo')).toBe('{"x":1}');
  });

  it('apagar some dos dois lugares (desligar o celular do projeto)', async () => {
    const { sistema, dados } = sistemaFalso();
    const c = cofreProtegido(sistema);
    await c.gravar('bee.nuvem.sessao', 's');
    await c.apagar('bee.nuvem.sessao');
    expect(await c.ler('bee.nuvem.sessao')).toBeNull();
    expect(dados.size).toBe(0);
  });

  it('cofre do sistema quebrado: nada lança, e a sessão atual segue pela memória', async () => {
    const { sistema } = sistemaFalso({ quebrado: true });
    const c = cofreProtegido(sistema);
    await expect(c.gravar('bee.nuvem.sessao', 's')).resolves.toBeUndefined();
    expect(await c.ler('bee.nuvem.sessao')).toBe('s');
    await expect(c.apagar('bee.nuvem.sessao')).resolves.toBeUndefined();
    expect(await c.ler('bee.nuvem.sessao')).toBeNull();
  });
});
