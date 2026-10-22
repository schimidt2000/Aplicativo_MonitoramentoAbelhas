import { describe, expect, it } from 'vitest';
import {
  INICIO_DO_PROJETO_MS, TOLERANCIA_RETROCESSO_MS, avaliarRelogioDoCelular,
} from '@/core/relogio';

const AGORA = Date.UTC(2026, 9, 7, 12, 0, 0);

describe('o relógio do celular é plausível?', () => {
  it('hoje, sem coleta anterior: sim', () => {
    expect(avaliarRelogioDoCelular(AGORA, null)).toEqual({ plausivel: true });
  });

  it('antes do início do projeto: não — é o que aparelho com a pilha morta mostra', () => {
    for (const ruim of [0, Date.UTC(1970, 0, 1), Date.UTC(2000, 0, 1), Date.UTC(2026, 7, 31)]) {
      expect(avaliarRelogioDoCelular(ruim, null))
        .toEqual({ plausivel: false, motivo: 'antes-do-projeto' });
    }
  });

  it('exatamente no início do projeto: sim', () => {
    expect(avaliarRelogioDoCelular(INICIO_DO_PROJETO_MS, null).plausivel).toBe(true);
  });

  it('valor impossível (NaN, Infinity) não passa', () => {
    expect(avaliarRelogioDoCelular(Number.NaN, null).plausivel).toBe(false);
    expect(avaliarRelogioDoCelular(Number.POSITIVE_INFINITY, null).plausivel).toBe(false);
  });

  it('andou para trás além da tolerância: não', () => {
    const ultima = AGORA;
    expect(avaliarRelogioDoCelular(ultima - TOLERANCIA_RETROCESSO_MS - 1, ultima))
      .toEqual({ plausivel: false, motivo: 'voltou-no-tempo' });
  });

  it('pequeno ajuste de rede para trás (dentro da tolerância): sim', () => {
    const ultima = AGORA;
    expect(avaliarRelogioDoCelular(ultima - TOLERANCIA_RETROCESSO_MS, ultima).plausivel).toBe(true);
    expect(avaliarRelogioDoCelular(ultima - 60_000, ultima).plausivel).toBe(true);
  });

  it('andou para frente: sim, é o normal', () => {
    expect(avaliarRelogioDoCelular(AGORA + 14 * 86_400_000, AGORA).plausivel).toBe(true);
  });
});
