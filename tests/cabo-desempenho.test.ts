/**
 * Quanto custa a coleta pelo cabo (feature 005, T542, Princípio II). Medido em
 * Node (better-sqlite3 e sql.js). NÃO é o aparelho de referência nem o
 * navegador: é pré-triagem e alarme contra regressão grosseira. Os números
 * impressos vão para specs/005-coleta-pelo-cabo/plan.md (Verificação); o
 * limite do teste é folgado de propósito.
 *
 * 10.000 medições a 2 h são 833 dias: muito além de um arquivo real (o de 30
 * dias tem 361 medições, 5.768 bytes).
 */
import { describe, expect, it } from 'vitest';
import { coletarPeloCabo } from '@/data/coletaCabo';
import { contarLeituras, garantirApiario, garantirColmeia } from '@/data/repo';
import { prepararBanco } from '@/data/migracoes';
import { lerArquivo } from '@/core/decode/arquivo';
import { crc32 } from '@/core/cabo/crc32';
import type { SqlDb } from '@/data/types';
import { PlacaSimulada, TEMPOS_DE_TESTE, arquivoDaPlaca } from '@/transports/mock/firmware';
import { bancoDeTesteSemMigrar } from './apoio/banco';
import { bancoSqlJsSemMigrar } from './apoio/bancoSqlJs';

const N = 10_000;
const I = 7200;
const AGORA = Date.UTC(2026, 9, 21, 12);
const T0 = AGORA / 1000 - (N - 1) * I - 1800;
const CONFIG = {
  escutaInicialMs: 30, esperaPelaPlacaMs: 2_000, reenviarHelloMs: 300, prazoRespostaMs: 2_000, silencioMaximoMs: 1_000,
};

function medir(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function preparar(db: SqlDb): SqlDb {
  prepararBanco(db);
  garantirApiario(db, 'ap', 'Apiário');
  garantirColmeia(db, 'h', 'ap', 'Colmeia');
  return db;
}

describe('desempenho da coleta pelo cabo (Node, não o aparelho)', () => {
  const arquivo = arquivoDaPlaca(T0, N);

  it(`ler e conferir o CRC de ${N} medições (${arquivo.length} bytes)`, () => {
    const ms = medir(() => { crc32(arquivo); lerArquivo('arquivo-0', arquivo); });
    console.log(`[005] CRC + leitor arquivo-0, ${N} medições: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1_000);
  });

  for (const [nome, criar] of [
    ['better-sqlite3', bancoDeTesteSemMigrar], ['sql.js', bancoSqlJsSemMigrar],
  ] as const) {
    it(`coleta inteira pela placa simulada, ${N} medições, ${nome}`, async () => {
      const db = preparar(await Promise.resolve(criar()));
      const p = new PlacaSimulada({ arquivo, tempos: { ...TEMPOS_DE_TESTE, pedacoMaximo: 4096 } });
      const { canal, terminou } = p.acordar('botao');
      const t0 = performance.now();
      const r = await coletarPeloCabo(db, canal, { hiveId: 'h', agora: () => AGORA, config: CONFIG, src: 'mock' });
      const ms = performance.now() - t0;
      await terminou;
      console.log(`[005] coleta pelo cabo, ${N} medições, ${nome}: ${ms.toFixed(0)} ms`);
      expect(r.nos[0].inseridas).toBe(N);
      expect(contarLeituras(db)).toBe(N);
      expect(ms).toBeLessThan(10_000);
    }, 30_000);
  }
});
