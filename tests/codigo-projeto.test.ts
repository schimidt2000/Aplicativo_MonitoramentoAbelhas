/**
 * O código do projeto é validado no aparelho, antes de qualquer rede (FR-012).
 * Se esta validação deixar passar um erro de digitação, ele vira tentativa
 * gasta no servidor — e cinco tentativas por hora travam o apicultor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALFABETO, codigoComVerificador, digitoVerificador, formatarCodigo, normalizarCodigo,
  validarCodigo,
} from '@/core/codigo-projeto';

const golden = JSON.parse(
  readFileSync(new URL('../servidor/golden/codigos.json', import.meta.url), 'utf8'),
) as { codigos: { corpo: string; completo: string }[] };

describe('código do projeto', () => {
  it('casa com o caso de referência que o servidor também confere', () => {
    for (const { corpo, completo } of golden.codigos) {
      expect(codigoComVerificador(corpo)).toBe(completo);
      expect(validarCodigo(completo)).toEqual({ ok: true, codigo: completo });
    }
  });

  it('aceita hífen, espaço, minúscula e as leituras toleradas de Crockford', () => {
    expect(validarCodigo('dem0-a1b4')).toEqual({ ok: true, codigo: 'DEM0A1B4' });
    expect(validarCodigo(' DEMO A1B4 ')).toEqual({ ok: true, codigo: 'DEM0A1B4' });
    expect(normalizarCodigo('il-o')).toBe('110');
  });

  it('barra TODA troca de um símbolo, em toda posição', () => {
    for (const { completo } of golden.codigos) {
      for (let i = 0; i < completo.length; i++) {
        for (const s of ALFABETO) {
          if (s === completo[i]) continue;
          const errado = completo.slice(0, i) + s + completo.slice(i + 1);
          expect(validarCodigo(errado).ok, `${errado} passou`).toBe(false);
        }
      }
    }
  });

  it('barra quase toda inversão de dois vizinhos', () => {
    let testadas = 0;
    let barradas = 0;
    for (const { completo } of golden.codigos) {
      for (let i = 0; i < completo.length - 1; i++) {
        if (completo[i] === completo[i + 1]) continue;
        const trocado = completo.slice(0, i) + completo[i + 1] + completo[i]
          + completo.slice(i + 2);
        testadas += 1;
        if (!validarCodigo(trocado).ok) barradas += 1;
      }
    }
    expect(testadas).toBeGreaterThan(30);
    expect(barradas / testadas).toBeGreaterThan(0.9);
  });

  it('distingue vazio, tamanho errado e símbolo fora do alfabeto', () => {
    expect(validarCodigo('')).toEqual({ ok: false, motivo: 'vazio' });
    expect(validarCodigo('DEM0-A1B')).toEqual({ ok: false, motivo: 'tamanho' });
    expect(validarCodigo('DEM0-A1B44')).toEqual({ ok: false, motivo: 'tamanho' });
    expect(validarCodigo('DEMU-A1B4')).toEqual({ ok: false, motivo: 'simbolo' });
    expect(validarCodigo('DEM0-A1B5')).toEqual({ ok: false, motivo: 'verificador' });
  });

  it('formata enquanto a pessoa digita', () => {
    expect(formatarCodigo('dem')).toBe('DEM');
    expect(formatarCodigo('dem0a')).toBe('DEM0-A');
    expect(formatarCodigo('dem0a1b4zzz')).toBe('DEM0-A1B4');
  });

  it('recusa corpo com símbolo inválido em vez de inventar dígito', () => {
    expect(() => digitoVerificador('ABCU123')).toThrow();
  });
});
