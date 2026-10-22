/**
 * Quanto custa avaliar a hora (feature 003, Princípio II). Medido em Node, nos
 * dois drivers que rodam fora do celular. NÃO é o aparelho de referência: serve
 * de pré-triagem e de alarme contra regressão grosseira. Os números impressos
 * vão para o plan.md; o limite do teste é folgado de propósito.
 */
import { describe, expect, it } from 'vitest';
import { ingerirLote } from '@/data/ingest';
import { atualizarHoras, gravarReferencia } from '@/data/hora';
import {
  garantirApiario, garantirColmeia, garantirNode, listarColmeias, loteNaoEnviado,
  resumosDiarios,
} from '@/data/repo';
import { prepararBanco } from '@/data/migracoes';
import type { SqlDb } from '@/data/types';
import { PERFIL_SAUDAVEL, gerarSerie } from '@/transports/mock';
import { bancoDeTesteSemMigrar } from './apoio/banco';
import { bancoSqlJsSemMigrar } from './apoio/bancoSqlJs';

const LIGOU = Date.UTC(2026, 8, 1);
const N = 10_000;

function medir(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function preparar(db: SqlDb) {
  prepararBanco(db);
  garantirApiario(db, 'ap', 'Apiário');
  garantirColmeia(db, 'h', 'ap', 'Colmeia');
  const nodeId = garantirNode(db, 'PERF', 'h', 900);
  const serie = gerarSerie({
    dias: 0, quantidade: N, reinicioEm: 4000, periodoS: 900, perfil: PERFIL_SAUDAVEL,
    seed: 1, comLacunas: true, comInvalidas: true,
  });
  for (let i = 0; i < serie.length; i += 500) {
    ingerirLote(db, nodeId, serie.slice(i, i + 500), { clockMode: 'uptime' }, 1, 'mock');
  }
  // 20 coletas ao longo da série, cada uma com a sua referência.
  for (let k = 1; k <= 20; k++) {
    const i = k * 500 - 1;
    gravarReferencia(db, nodeId, {
      origem: 'coleta', bootId: null, ligada: null, tNode: serie[i].tNode,
      tUtcMs: LIGOU + i * 900_000, monoMs: 0, rttMs: 0, src: 'mock', aceita: true,
      seqRef: serie[i].seq, modo: 'uptime', criadoMs: 0,
    });
  }
  return nodeId;
}

const DRIVERS: Array<[string, () => Promise<SqlDb>]> = [
  ['better-sqlite3', async () => bancoDeTesteSemMigrar()],
  ['sql.js', bancoSqlJsSemMigrar],
];

describe.each(DRIVERS)('desempenho com %s, 10.000 leituras', (nome, abrir) => {
  it('avaliar, gravar a versão e refazer os resumos; ler a série', async () => {
    const db = await abrir();
    const nodeId = preparar(db);

    const avaliar = medir(() => atualizarHoras(db, nodeId, 'coleta', LIGOU));
    const lista = medir(() => listarColmeias(db));
    const lote = medir(() => loteNaoEnviado(db, nodeId, 500));
    const resumo = medir(() => resumosDiarios(db, nodeId, 3650));

    // eslint-disable-next-line no-console
    console.log(`[desempenho ${nome}] avaliar+gravar+resumos ${avaliar.toFixed(0)} ms · `
      + `lista ${lista.toFixed(1)} ms · lote de 500 ${lote.toFixed(1)} ms · resumos ${resumo.toFixed(1)} ms`);
    expect(listarColmeias(db)[0].ultima_ms).not.toBeNull();
    expect(avaliar).toBeLessThan(3000);
    expect(lista).toBeLessThan(500);
  });
});
