/**
 * Voláteis relativos ao normal da própria colmeia (feature 007).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classificarVolateis, LIMIAR_PERCENTUAL, MINIMO_DE_DIAS, normalDaColmeia, percentualDoNormal,
} from '@/core/volateis';
import { fmtVolateisRelativo } from '@/core/format';

const HOJE = 20_000;
const dias = (vals: Array<number | null>, ate = HOJE - 1) =>
  vals.map((v, i) => ({ day: ate - (vals.length - 1 - i), tvoc_med: v }));

describe('normal da colmeia', () => {
  it('mediana das médias diárias dos dias anteriores a hoje', () => {
    expect(normalDaColmeia(dias([100, 400, 200]), HOJE)).toEqual({ ppb: 200, dias: 3 });
    expect(normalDaColmeia(dias([100, 200, 300, 1000]), HOJE)).toEqual({ ppb: 250, dias: 4 });
  });

  it('um dia de manejo (fumaça) não desloca o normal', () => {
    expect(normalDaColmeia(dias([200, 210, 5000, 190, 205]), HOJE).ppb).toBe(205);
  });

  it('hoje fica de fora, e só valem os 14 dias anteriores', () => {
    const d = [...dias([100, 100, 100]), { day: HOJE, tvoc_med: 9000 }, { day: HOJE - 30, tvoc_med: 9000 }];
    expect(normalDaColmeia(d, HOJE)).toEqual({ ppb: 100, dias: 3 });
  });

  it('dias sem média (leituras ruins do sensor de gás) não contam; menos de 3 dias, aprendendo', () => {
    expect(normalDaColmeia(dias([100, null, 120]), HOJE)).toEqual({ ppb: null, dias: 2 });
    expect(MINIMO_DE_DIAS).toBe(3);
  });

  it('normal zero não divide: segue aprendendo', () => {
    expect(normalDaColmeia(dias([0, 0, 0]), HOJE).ppb).toBeNull();
  });
});

describe('classificação', () => {
  const normal = { ppb: 200, dias: 10 };
  it('diferença em % do normal, arredondada', () => {
    expect(percentualDoNormal(330, normal)).toBe(65);
    expect(percentualDoNormal(120, normal)).toBe(-40);
    expect(percentualDoNormal(null, normal)).toBeNull();
  });

  it(`"acima" e "abaixo" a partir de ${LIMIAR_PERCENTUAL} %; dentro disso, "normal"`, () => {
    expect(classificarVolateis(300, normal)).toEqual({ estado: 'acima', percentual: 50 });
    expect(classificarVolateis(298, normal)).toEqual({ estado: 'normal', percentual: 49 });
    expect(classificarVolateis(100, normal)).toEqual({ estado: 'abaixo', percentual: -50 });
    expect(classificarVolateis(101, normal).estado).toBe('normal');
  });

  it('sem normal: aprendendo, com os dias que já há; sem valor: sem valor', () => {
    expect(classificarVolateis(300, { ppb: null, dias: 2 })).toEqual({ estado: 'aprendendo', dias: 2 });
    expect(classificarVolateis(null, normal)).toEqual({ estado: 'sem-valor' });
  });

  it('os textos dizem o que é, sem ppb e sem CO₂', () => {
    expect(fmtVolateisRelativo({ estado: 'acima', percentual: 65 }, 'curta')).toBe('65 % acima do normal');
    expect(fmtVolateisRelativo({ estado: 'abaixo', percentual: -40 }, 'curta')).toBe('40 % abaixo do normal');
    expect(fmtVolateisRelativo({ estado: 'normal', percentual: 10 }, 'curta')).toBe('normal');
    expect(fmtVolateisRelativo({ estado: 'aprendendo', dias: 1 }, 'curta')).toBe('aprendendo o normal');
    expect(fmtVolateisRelativo({ estado: 'acima', percentual: 65 }, 'cartao')).toBe('+65 %');
    expect(fmtVolateisRelativo({ estado: 'abaixo', percentual: -40 }, 'cartao')).toBe('−40 %');
    expect(fmtVolateisRelativo({ estado: 'acima', percentual: 1250 }, 'curta')).toBe('1.250 % acima do normal');
  });
});

describe('telas de campo sem ppb (SC-001)', () => {
  // A tela de bancada (004, cabo.tsx) é da equipe técnica e mostra o valor do sensor.
  const EXCECOES = new Set(['src/app/cabo.tsx']);
  const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.tsx') ? [p] : [];
  });
  it('nenhuma tela de src/app formata voláteis em ppb', () => {
    const ruins = arquivos('src/app')
      .filter((a) => !EXCECOES.has(a))
      .filter((a) => /fmtVolateis\(|' ppb'|"ppb"/.test(readFileSync(a, 'utf8')));
    expect(ruins).toEqual([]);
  });
});

describe('dia de referência', () => {
  it('é o da última leitura: colmeia sem coleta há semanas ainda tem normal', async () => {
    const { diaDeReferencia } = await import('@/core/volateis');
    const ultima = Date.UTC(2026, 9, 10, 15);
    const agora = Date.UTC(2026, 10, 5, 12);
    const ref = diaDeReferencia(ultima, agora);
    expect(ref).toBe(Math.floor(ultima / 86_400_000));
    expect(normalDaColmeia(dias([300, 310, 290], ref - 1), ref).ppb).toBe(300);
    expect(diaDeReferencia(null, agora)).toBe(Math.floor(agora / 86_400_000));
  });
});
