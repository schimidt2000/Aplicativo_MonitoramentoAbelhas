/**
 * O motor de envio contra a nuvem simulada. Estes testes são a Fatia 0 inteira:
 * provam a garantia de ponta a ponta sem existir servidor nenhum.
 */
import { describe, expect, it } from 'vitest';
import type { Reading } from '@/core/ports/transport';
import { ingerirLote } from '@/data/ingest';
import {
  contarLeituras, garantirApiario, garantirColmeia, garantirNode, totalPendentes,
} from '@/data/repo';
import { atrasoDeRetentativa, enviarPendentes } from '@/data/sync';
import { CODIGO_DEMO, NuvemMock } from '@/nuvem/mock/cliente';
import { bancoDeTeste } from './apoio/banco';

function cenario(quantas: number) {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário de Teste');
  garantirColmeia(db, 'h-1', 'ap-1', 'Colmeia 01');
  const nodeId = garantirNode(db, 'AA00', 'h-1', 900);

  const lote: Reading[] = Array.from({ length: quantas }, (_, i) => ({
    seq: i + 1, tNode: (i + 1) * 900,
    tempC100: 3460, rhX100: 6200, tvocPpb: 900, eco2Ppm: 700,
    aqiUba: 2, gasStatus: 0, battMv: 4000, flags: 0,
  }));
  // A hora não importa ao envio; a ingestão só guarda o modo de tempo do nó.
  ingerirLote(db, nodeId, lote, { clockMode: 'uptime' }, 1, 'mock');
  return { db, nodeId };
}

async function nuvemVinculada(falhas = {}) {
  const nuvem = new NuvemMock(falhas);
  await nuvem.vincular(CODIGO_DEMO);
  return nuvem;
}

describe('envio', () => {
  it('sobe tudo e não deixa pendente', async () => {
    const { db } = cenario(250);
    const nuvem = await nuvemVinculada();

    const r = await enviarPendentes(db, nuvem);

    expect(r.parou).toBeNull();
    expect(r.enviadas).toBe(250);
    expect(totalPendentes(db)).toBe(0);
    expect(nuvem.total()).toBe(250);
  });

  it('enviar de novo não cria linha nova nem no servidor nem no celular', async () => {
    const { db } = cenario(120);
    const nuvem = await nuvemVinculada();

    await enviarPendentes(db, nuvem);
    const segunda = await enviarPendentes(db, nuvem);

    expect(segunda.enviadas).toBe(0);
    expect(nuvem.total()).toBe(120);
    expect(contarLeituras(db)).toBe(120);
  });

  it('cai no meio, retoma do ponto, sem perder e sem duplicar', async () => {
    const { db } = cenario(300);
    const nuvem = await nuvemVinculada({ cortarApos: 180 });

    const primeira = await enviarPendentes(db, nuvem);
    expect(primeira.parou).toBe('tempo-esgotado');
    expect(totalPendentes(db)).toBeGreaterThan(0);

    // A queda não pode ter marcado como enviado nada que não foi confirmado.
    expect(primeira.enviadas).toBeLessThan(300);

    nuvem.limparFalhas();
    const segunda = await enviarPendentes(db, nuvem);

    expect(segunda.parou).toBeNull();
    expect(totalPendentes(db)).toBe(0);
    expect(nuvem.total()).toBe(300);      // nada duplicado
    expect(contarLeituras(db)).toBe(300); // nada perdido
  });

  it('sem rede não envia, não marca nada e não é tratado como erro', async () => {
    const { db } = cenario(50);
    const nuvem = await nuvemVinculada();
    nuvem.configurar({ semRede: true });

    const r = await enviarPendentes(db, nuvem);

    expect(r.parou).toBe('sem-rede');
    expect(r.enviadas).toBe(0);
    expect(totalPendentes(db)).toBe(50);
    expect(nuvem.total()).toBe(0);
  });

  it('portal cativo é distinguido de ausência de rede', async () => {
    const { db } = cenario(10);
    const nuvem = await nuvemVinculada();
    nuvem.configurar({ portalCativo: true });

    const r = await enviarPendentes(db, nuvem);

    expect(r.parou).toBe('portal-cativo');
    expect(nuvem.total()).toBe(0);
  });

  it('sem vínculo não envia nada', async () => {
    const { db } = cenario(10);
    const nuvem = new NuvemMock();

    const r = await enviarPendentes(db, nuvem);

    expect(r.parou).toBe('sem-vinculo');
    expect(totalPendentes(db)).toBe(10);
  });

  it('o cadastro sobe antes das leituras', async () => {
    const { db } = cenario(30);
    const nuvem = await nuvemVinculada();

    await enviarPendentes(db, nuvem);

    const c = nuvem.contagemCadastro();
    expect(c.apiarios).toBe(1);
    expect(c.colmeias).toBe(1);
    expect(c.nos).toBe(1);
  });

  it('cadastro criado DURANTE o envio do cadastro sobe no envio seguinte', async () => {
    // O envio espera a rede; nesse meio tempo a pessoa pode cadastrar uma
    // colmeia. Se o cursor fosse o relógio DEPOIS da resposta, essa colmeia
    // ficaria abaixo dele e nunca subiria — e o nó apontando para ela faria o
    // cadastro inteiro ser recusado no servidor (chave estrangeira) para sempre.
    const { db } = cenario(5);
    const nuvem = await nuvemVinculada();
    const original = nuvem.enviarCadastro.bind(nuvem);
    const vistas: string[] = [];
    let primeira = true;
    nuvem.enviarCadastro = async (c) => {
      vistas.push(...c.colmeias.map((h) => h.id));
      if (primeira) {
        primeira = false;
        garantirColmeia(db, 'h-nova', 'ap-1', 'Colmeia criada durante o envio');
        await new Promise((r) => setTimeout(r, 5));
      }
      return original(c);
    };

    await enviarPendentes(db, nuvem);
    await enviarPendentes(db, nuvem);

    expect(vistas).toContain('h-nova');
  });

  it('nenhuma leitura é apagada do celular em nenhum caminho', async () => {
    const { db } = cenario(200);
    const nuvem = await nuvemVinculada({ cortarApos: 90 });

    await enviarPendentes(db, nuvem);
    nuvem.configurar({ semRede: true });
    await enviarPendentes(db, nuvem);

    expect(contarLeituras(db)).toBe(200);
  });
});

describe('recuo com jitter', () => {
  it('sorteia entre zero e o teto, e o teto cresce com a tentativa', () => {
    expect(atrasoDeRetentativa(0, () => 0)).toBe(0);
    expect(atrasoDeRetentativa(0, () => 0.999)).toBeLessThan(1000);
    expect(atrasoDeRetentativa(5, () => 0.999)).toBeGreaterThan(
      atrasoDeRetentativa(1, () => 0.999),
    );
  });

  it('nunca passa de cinco minutos', () => {
    expect(atrasoDeRetentativa(50, () => 0.999)).toBeLessThanOrEqual(5 * 60_000);
  });
});
