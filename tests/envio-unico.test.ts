/**
 * Feature 008 (FR-007): o envio automático do Início e o "Enviar agora" nunca
 * rodam ao mesmo tempo.
 */
import { describe, expect, it } from 'vitest';
import type { Reading } from '@/core/ports/transport';
import { ingerirLote } from '@/data/ingest';
import { garantirApiario, garantirColmeia, garantirNode, totalPendentes } from '@/data/repo';
import { enviando, enviarUmPorVez } from '@/data/envioUnico';
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
  ingerirLote(db, nodeId, lote, { clockMode: 'uptime' }, 1, 'mock');
  return db;
}

describe('um envio por vez', () => {
  it('o segundo pedido recebe o mesmo envio, e nada sobe duas vezes', async () => {
    const db = cenario(150);
    const nuvem = new NuvemMock();
    await nuvem.vincular(CODIGO_DEMO);

    const a = enviarUmPorVez(db, nuvem);
    const b = enviarUmPorVez(db, nuvem);
    expect(b).toBe(a);
    expect(enviando()).toBe(true);

    const r = await a;
    expect(r.enviadas).toBe(150);
    expect(enviando()).toBe(false);
    expect(totalPendentes(db)).toBe(0);
    expect(nuvem.total()).toBe(150);
  });

  it('terminado um envio, o próximo começa de novo', async () => {
    const db = cenario(10);
    const nuvem = new NuvemMock();
    await nuvem.vincular(CODIGO_DEMO);

    const primeiro = enviarUmPorVez(db, nuvem);
    await primeiro;
    const segundo = enviarUmPorVez(db, nuvem);
    expect(segundo).not.toBe(primeiro);
    expect((await segundo).enviadas).toBe(0);
  });

  it('sem vínculo não envia nada e não fica preso', async () => {
    const db = cenario(5);
    const r = await enviarUmPorVez(db, new NuvemMock());
    expect(r.parou).toBe('sem-vinculo');
    expect(enviando()).toBe(false);
    expect(totalPendentes(db)).toBe(5);
  });
});
