/**
 * Regra de não comparar voláteis entre colmeias (Princípio VI, FR-031, US3
 * cenário 4). Três travas:
 *  1. o índice de uma trilha depende só dela mesma (escala e outras trilhas
 *     não mudam nada);
 *  2. a visão geral não recebe nem mostra campo de gás;
 *  3. o índice não atravessa época de sensor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { criarFonteDemo } from '../src/dados/demo';
import type { ResumoDiario } from '../src/dados/porta';
import { montarSerie } from '../src/dominio/serie';
import { MIN_DIAS_LINHA_BASE, indiceVolateis, linhaDeBase } from '../src/dominio/volateis';

function resumo(noId: string, dia: number, tvoc: number | null, epoca = 1): ResumoDiario {
  return {
    noId, dia, epocaSensor: epoca, tempMinC100: null, tempMedC100: null, tempMaxC100: null,
    umidMedX100: null, tvocMedPpb: tvoc, validas: 96, excluidas: 0,
  };
}

const tvoc = (r: ResumoDiario) => r.tvocMedPpb;
const PADRAO = [400, 420, 380, 800, 410, null, 395];

function indice(rs: ResumoDiario[]) {
  return indiceVolateis(montarSerie(rs, 1, PADRAO.length, tvoc));
}

describe('índice de voláteis', () => {
  it('100 é a mediana da própria trilha', () => {
    const s = indice(PADRAO.map((v, i) => resumo('A', i + 1, v)));
    expect(s.trilhas[0].base).toBe(405);
    expect(s.trilhas[0].y[3]).toBeCloseTo((100 * 800) / 405, 6);
  });

  it('colmeias com nível absoluto 5× diferente e o mesmo padrão têm o MESMO índice', () => {
    const a = indice(PADRAO.map((v, i) => resumo('A', i + 1, v)));
    const b = indice(PADRAO.map((v, i) => resumo('B', i + 1, v === null ? null : v * 5)));
    const ya = a.trilhas[0].y;
    const yb = b.trilhas[0].y;
    ya.forEach((v, i) => (v === null ? expect(yb[i]).toBeNull() : expect(yb[i]).toBeCloseTo(v, 9)));
  });

  it('a linha de base de uma trilha não usa dado de outra', () => {
    const so = indice(PADRAO.map((v, i) => resumo('A', i + 1, v)));
    const junto = indice([
      ...PADRAO.map((v, i) => resumo('A', i + 1, v)),
      ...PADRAO.map((v, i) => resumo('B', i + 1, v === null ? null : v * 7)),
    ]);
    expect(junto.trilhas.find((tr) => tr.noId === 'A')!.y).toEqual(so.trilhas[0].y);
  });

  it('não atravessa época: mudar a época 2 não muda o índice da época 1', () => {
    const base = [
      resumo('A', 1, 400), resumo('A', 2, 420), resumo('A', 3, 380), resumo('A', 4, 410),
      resumo('A', 5, 900, 2), resumo('A', 6, 950, 2), resumo('A', 7, 910, 2),
    ];
    const outra = base.map((r) => (r.epocaSensor === 2 ? { ...r, tvocMedPpb: r.tvocMedPpb! * 3 } : r));
    const i1 = indiceVolateis(montarSerie(base, 1, 7, tvoc));
    const i2 = indiceVolateis(montarSerie(outra, 1, 7, tvoc));
    expect(i1.trilhas[0].y).toEqual(i2.trilhas[0].y);
    expect(i1.trilhas[0].base).toBe(405);
    expect(i1.trilhas[1].base).toBe(910);
  });

  it(`sem linha de base com menos de ${MIN_DIAS_LINHA_BASE} dias: tudo null, nunca número inventado`, () => {
    const s = indiceVolateis(montarSerie([resumo('A', 1, 400), resumo('A', 2, 420)], 1, 2, tvoc));
    expect(s.trilhas[0].base).toBeNull();
    expect(s.trilhas[0].y).toEqual([null, null]);
  });

  it('linha de base zero não vira divisor', () => {
    expect(linhaDeBase([0, 0, 0])).toBeNull();
  });
});

describe('a visão geral não carrega voláteis', () => {
  it('nenhuma linha da visão geral tem campo de gás', async () => {
    const fonte = criarFonteDemo(20_000);
    const linhas = await fonte.visaoGeral();
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) {
      for (const k of Object.keys(l)) expect(k).not.toMatch(/tvoc|vol|cov|eco2|gas/i);
    }
  });

  it('a tela da visão geral não lê nenhum campo de gás', () => {
    const fonte = readFileSync(new URL('../src/telas/VisaoGeral.tsx', import.meta.url), 'utf8');
    // Comentários podem explicar a regra; o código não pode usar o campo.
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/tvoc|volateis|Volateis|eco2|situacaoGas|grafico\.vol/);
  });
});
