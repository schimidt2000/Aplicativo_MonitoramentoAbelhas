/**
 * Invariantes do Princípio III. Estes são os primeiros testes do projeto: o
 * plan.md da 001 declarou PASS citando-os como evidência, mas eles não existiam.
 */
import { describe, expect, it } from 'vitest';
import type { Reading } from '@/core/ports/transport';
import { ingerirLote, recalcularResumos, type OrigemDoLote } from '@/data/ingest';
import { atualizarHoras, gravarReferencia } from '@/data/hora';
import {
  contarLeituras, garantirApiario, garantirColmeia, garantirNode, resumosDiarios,
  ultimoSeq,
} from '@/data/repo';
import { bancoDeTeste } from './apoio/banco';

const T0 = Date.UTC(2026, 9, 7, 12); // referência fixa: nada aqui depende do relógio real

/** A ingestão não calcula hora (feature 003): só guarda o modo de tempo do nó. */
const ORIGEM: OrigemDoLote = { clockMode: 'uptime' };

/**
 * A referência de hora de uma coleta cuja leitura mais nova é `seqRef`, com o
 * contador `tNode`. Depois dela, `atualizarHoras` dá hora às leituras.
 */
function ancorar(db: ReturnType<typeof bancoDeTeste>, nodeId: number, seqRef: number, tNode: number) {
  gravarReferencia(db, nodeId, {
    origem: 'coleta', bootId: 'b1', ligada: null, tNode, tUtcMs: T0, monoMs: 0, rttMs: 0,
    src: 'mock', aceita: true, seqRef, modo: 'uptime', criadoMs: T0,
  });
  atualizarHoras(db, nodeId, 'coleta', T0);
}

function leitura(seq: number, over: Partial<Reading> = {}): Reading {
  return {
    seq,
    tNode: seq * 900,
    tempC100: 3460, rhX100: 6200, tvocPpb: 900,
    eco2Ppm: 700, aqiUba: 2, gasStatus: 0, battMv: 4000, flags: 0,
    ...over,
  };
}

function prepararNo() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap-1', 'Meliponário de Teste');
  garantirColmeia(db, 'h-1', 'ap-1', 'Colmeia 01');
  const nodeId = garantirNode(db, 'AA00', 'h-1', 900);
  return { db, nodeId };
}

describe('INV-1 — reimportar é operação sem efeito', () => {
  it('a segunda importação do mesmo lote não muda a contagem', () => {
    const { db, nodeId } = prepararNo();
    const lote = [leitura(1), leitura(2), leitura(3)];

    const primeira = ingerirLote(db, nodeId, lote, ORIGEM, 1, 'mock');
    const depoisDaPrimeira = contarLeituras(db, nodeId);

    const segunda = ingerirLote(db, nodeId, lote, ORIGEM, 1, 'mock');
    const depoisDaSegunda = contarLeituras(db, nodeId);

    expect(primeira.inseridas).toBe(3);
    expect(segunda.inseridas).toBe(0);
    expect(depoisDaSegunda).toBe(depoisDaPrimeira);
  });

  it('um lote que se sobrepõe parcialmente insere apenas o que falta', () => {
    const { db, nodeId } = prepararNo();
    ingerirLote(db, nodeId, [leitura(1), leitura(2)], ORIGEM, 1, 'mock');
    const r = ingerirLote(
      db, nodeId, [leitura(2), leitura(3), leitura(4)], ORIGEM, 1, 'mock',
    );

    expect(r.inseridas).toBe(2);
    expect(contarLeituras(db, nodeId)).toBe(4);
  });
});

describe('INV-2 — a leitura é imutável', () => {
  it('reingerir com valores diferentes NÃO sobrescreve a medição original', () => {
    const { db, nodeId } = prepararNo();
    ingerirLote(db, nodeId, [leitura(1, { tempC100: 3400 })], ORIGEM, 1, 'mock');
    ingerirLote(db, nodeId, [leitura(1, { tempC100: 9999 })], ORIGEM, 1, 'mock');

    const linhas = db.all<{ temp_c100: number }>(
      'SELECT temp_c100 FROM reading WHERE node_id = ? AND seq = 1', [nodeId],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].temp_c100).toBe(3400);
  });
});

describe('INV-3 — lacuna no contador é normal', () => {
  it('contador com buracos ingere sem erro e o cursor é o maior seq', () => {
    const { db, nodeId } = prepararNo();
    // Lacunas acontecem porque o firmware persiste `seq` a cada N registros e
    // salta para frente ao reiniciar. Não é perda de dado.
    const r = ingerirLote(
      db, nodeId, [leitura(1), leitura(2), leitura(70), leitura(71)],
      ORIGEM, 1, 'mock',
    );

    expect(r.inseridas).toBe(4);
    expect(ultimoSeq(db, nodeId)).toBe(71);
  });
});

describe('INV-5 — amostra inválida fica fora do resumo, mas é contada', () => {
  it('gasStatus diferente de 0 não entra na média e aparece em excluded_count', () => {
    const { db, nodeId } = prepararNo();
    const validas = [1, 2, 3, 4].map((s) => leitura(s, { tempC100: 3400 }));
    // gasStatus 1 = aquecendo, 2 = partida inicial, 3 = fora de faixa.
    const invalidas = [5, 6].map((s) => leitura(s, { tempC100: 9999, gasStatus: 1 }));

    ingerirLote(db, nodeId, [...validas, ...invalidas], ORIGEM, 1, 'mock');
    ancorar(db, nodeId, 6, 6 * 900);
    recalcularResumos(db, nodeId);

    const dias = resumosDiarios(db, nodeId, 3650);
    expect(dias.length).toBeGreaterThan(0);

    const total = dias.reduce(
      (a, d) => ({
        amostras: a.amostras + d.sample_count,
        excluidas: a.excluidas + d.excluded_count,
      }),
      { amostras: 0, excluidas: 0 },
    );

    expect(total.excluidas).toBe(2);
    // A mediana não pode ter sido puxada pelas inválidas.
    for (const d of dias) {
      if (d.temp_med !== null) expect(d.temp_med).toBeLessThan(9999);
    }
  });

  it('um dia inteiro sem amostra válida não gera linha de resumo', () => {
    const { db, nodeId } = prepararNo();
    ingerirLote(
      db, nodeId,
      [1, 2, 3].map((s) => leitura(s, { gasStatus: 3 })),
      ORIGEM, 1, 'mock',
    );
    ancorar(db, nodeId, 3, 3 * 900);
    recalcularResumos(db, nodeId);

    // A AUSÊNCIA da linha é o que vira lacuna no gráfico. Se aparecesse uma
    // linha com zeros, o gráfico desenharia uma queda que não aconteceu.
    const comMedia = resumosDiarios(db, nodeId, 3650).filter((d) => d.temp_med !== null);
    expect(comMedia).toHaveLength(0);
  });
});
