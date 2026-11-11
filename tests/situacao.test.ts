/**
 * Feature 008 (FR-003): a única linha de situação do cartão da colmeia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  precisaVisita, situacaoDaColmeia, tomDaSituacao, type EntradaSituacao, type Situacao,
} from '@/core/situacao';

const AGORA = Date.UTC(2026, 10, 10, 12);
const DIA = 86_400_000;
const base: EntradaSituacao = {
  coletadaMs: AGORA - DIA, intervaloDias: 15, battMv: 4000, ultimoResultado: 'ok',
};
const sit = (mudar: Partial<EntradaSituacao>) => situacaoDaColmeia({ ...base, ...mudar });

describe('situação da colmeia', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AGORA); });
  afterEach(() => { vi.useRealTimers(); });

  it('tudo certo quando coletada há pouco, bateria boa e coleta completa', () => {
    expect(sit({})).toBe('em-dia');
  });

  it('bateria não informada não vira situação', () => {
    expect(sit({ battMv: null })).toBe('em-dia');
  });

  it('segue a ordem da spec quando há mais de um problema', () => {
    const tudoRuim = { ultimoResultado: 'queda', battMv: 3400, coletadaMs: AGORA - 40 * DIA };
    expect(sit(tudoRuim)).toBe('incompleta');
    expect(sit({ ...tudoRuim, ultimoResultado: 'ok' })).toBe('bateria-agora');
    expect(sit({ battMv: 3700, coletadaMs: AGORA - 40 * DIA })).toBe('muito-atrasada');
    expect(sit({ battMv: 3700, coletadaMs: AGORA - 20 * DIA })).toBe('atrasada');
    expect(sit({ battMv: 3700, coletadaMs: AGORA - 13 * DIA })).toBe('bateria-breve');
    expect(sit({ coletadaMs: AGORA - 13 * DIA })).toBe('chegando');
    expect(sit({ coletadaMs: null, ultimoResultado: null })).toBe('sem-coleta');
  });

  it('nunca há coleta: sem coleta, não atraso', () => {
    expect(sit({ coletadaMs: null, ultimoResultado: null, battMv: null })).toBe('sem-coleta');
  });

  it('todo tom tem uma situação e "tudo certo" é o único ok', () => {
    const todas: Situacao[] = ['incompleta', 'bateria-agora', 'muito-atrasada', 'atrasada',
      'bateria-breve', 'chegando', 'sem-coleta', 'em-dia'];
    expect(todas.filter((s) => tomDaSituacao(s) === 'ok')).toEqual(['em-dia']);
    expect(todas.filter(precisaVisita))
      .toEqual(['incompleta', 'bateria-agora', 'muito-atrasada', 'atrasada']);
  });
});
