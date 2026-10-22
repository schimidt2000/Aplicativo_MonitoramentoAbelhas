/**
 * `persist()` do banco do navegador (src/data/db.web.ts) é o "durável" que a
 * coleta pelo cabo espera antes de mandar o RECEIVED (feature 005, D-502): a
 * placa apaga o arquivo logo depois. Durável quer dizer gravado no disco, não
 * só entregue ao sistema: o padrão do IndexedDB deixa o navegador escolher, e
 * Chrome e Firefox podem dar a transação por concluída antes do disco
 * ("relaxed"). Por isso o `persist()` pede `durability: 'strict'`, e só ele —
 * a gravação de fundo continua no padrão, que é mais barato.
 *
 * Sem IndexedDB em Node: um falso mínimo registra cada transação e só a
 * conclui um pouco depois, para provar também que `persist()` espera o fim.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sql.js', async (original) => {
  const real = (await original()) as { default: (o?: unknown) => Promise<unknown> };
  // Em Node o wasm vem do pacote, não de `/sql-wasm-browser.wasm` do site.
  return { default: () => real.default() };
});

interface Transacao { modo: string; opcoes: { durability?: string } | undefined; concluida: boolean }

function indexedDbFalso() {
  const guardado = new Map<string, unknown>();
  const transacoes: Transacao[] = [];
  const idb = {
    open() {
      const req: { result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = {};
      setTimeout(() => {
        req.result = {
          transaction(_store: string, modo: string, opcoes?: { durability?: string }) {
            const reg: Transacao = { modo, opcoes, concluida: false };
            transacoes.push(reg);
            const tx: { oncomplete?: () => void; objectStore: () => unknown } = {
              objectStore: () => ({
                put(v: unknown, k: string) { guardado.set(k, v); },
                get(k: string) {
                  const r: { result?: unknown; onsuccess?: () => void } = {};
                  setTimeout(() => { r.result = guardado.get(k); r.onsuccess?.(); }, 0);
                  return r;
                },
              }),
            };
            setTimeout(() => { reg.concluida = true; tx.oncomplete?.(); }, 20);
            return tx;
          },
          close() {},
        };
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  return { idb, transacoes };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('persist() do navegador', () => {
  it('grava com durability "strict" e só volta quando a transação terminou', async () => {
    const falso = indexedDbFalso();
    vi.stubGlobal('indexedDB', falso.idb);
    const { abrirBanco } = await import('@/data/db.web');
    const db = await abrirBanco();
    db.run("INSERT INTO config (chave, valor) VALUES ('x', '1')");

    await db.persist();

    const escritas = falso.transacoes.filter((x) => x.modo === 'readwrite');
    expect(escritas.length).toBeGreaterThan(0);
    const ultima = escritas[escritas.length - 1];
    expect(ultima.opcoes).toEqual({ durability: 'strict' });
    expect(ultima.concluida).toBe(true);
  });
});
