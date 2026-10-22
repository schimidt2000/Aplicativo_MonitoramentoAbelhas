/**
 * Contraste dos tokens de cor, recalculado (WCAG 2.x, luminância relativa).
 * Princípio V: 7:1 no texto primário, 4,5:1 no secundário, 3:1 em bordas.
 * O comentário em src/ui/tokens.ts já esteve errado uma vez; aqui o número é
 * conferido, não copiado.
 */
import { describe, expect, it } from 'vitest';
import { cores } from '@/ui/tokens';

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const FUNDOS = { superficie: cores.superficie, fundo: cores.fundo };

describe('contraste dos tokens sobre os dois fundos', () => {
  for (const [nomeFundo, fundo] of Object.entries(FUNDOS)) {
    it(`texto primário >= 7:1 sobre ${nomeFundo}`, () => {
      expect(contraste(cores.texto, fundo)).toBeGreaterThanOrEqual(7);
      expect(contraste(cores.textoFraco, fundo)).toBeGreaterThanOrEqual(7);
    });

    it(`cores de estado servem a texto secundário (>= 4,5:1) sobre ${nomeFundo}`, () => {
      for (const c of [cores.acento, cores.ok, cores.atencao, cores.perigo, cores.neutro]) {
        expect(contraste(c, fundo)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`borda de controle >= 3:1 sobre ${nomeFundo}`, () => {
      expect(contraste(cores.bordaControle, fundo)).toBeGreaterThanOrEqual(3);
    });
  }

  it('`linha` é só divisória: não passa de 3:1, por isso não delimita controle', () => {
    // Se alguém escurecer `linha` até 3:1, este teste avisa que o token novo
    // pode ter virado redundante — e não o contrário, em silêncio.
    expect(contraste(cores.linha, cores.superficie)).toBeLessThan(3);
  });

  it('a fórmula confere com valores conhecidos', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});
