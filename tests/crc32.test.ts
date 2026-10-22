/**
 * CRC-32/ISO-HDLC (feature 005, FR-004). Vetores conhecidos do catálogo de
 * CRCs (reveng) e do zlib, e uma conferência contra uma tradução literal do
 * laço bit a bit que a placa roda (`calculatedFileCrc32`, teste_de_firmware.ino).
 */
import { describe, expect, it } from 'vitest';
import {
  CRC32_INICIAL, crc32, crc32Atualizar, crc32Finalizar, crcEmHex,
} from '@/core/cabo/crc32';

const texto = (s: string) => new TextEncoder().encode(s);

/** O laço do firmware, linha por linha, sem tabela. */
function crcDaPlaca(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc = (crc ^ b) >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? ((crc >>> 1) ^ 0xedb88320) >>> 0 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('CRC-32/ISO-HDLC', () => {
  it('vetor de verificação do catálogo: "123456789" → CBF43926', () => {
    expect(crcEmHex(crc32(texto('123456789')))).toBe('CBF43926');
  });

  it('outros vetores conhecidos', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crcEmHex(crc32(texto('a')))).toBe('E8B7BE43');
    expect(crcEmHex(crc32(texto('The quick brown fox jumps over the lazy dog')))).toBe('414FA339');
    expect(crcEmHex(crc32(new Uint8Array(32)))).toBe('190A55AD');
    expect(crcEmHex(crc32(new Uint8Array(32).fill(0xff)))).toBe('FF6CAB0B');
  });

  it('acumular em pedaços dá o mesmo que de uma vez, em qualquer corte', () => {
    const dados = new Uint8Array(1000).map((_, i) => (i * 37 + 11) & 0xff);
    const inteiro = crc32(dados);
    for (const corte of [0, 1, 7, 255, 256, 257, 999, 1000]) {
      let e = crc32Atualizar(CRC32_INICIAL, dados.subarray(0, corte));
      e = crc32Atualizar(e, dados.subarray(corte));
      expect(crc32Finalizar(e)).toBe(inteiro);
    }
  });

  it('bate com o laço bit a bit da placa em dados aleatórios', () => {
    let x = 12345;
    for (let rodada = 0; rodada < 20; rodada++) {
      const n = (rodada * 97) % 600;
      const dados = new Uint8Array(n).map(() => {
        x = (x * 1103515245 + 12345) >>> 0;
        return x >>> 24;
      });
      expect(crc32(dados)).toBe(crcDaPlaca(dados));
    }
  });

  it('escreve com 8 dígitos maiúsculos, como o %08lX da placa', () => {
    expect(crcEmHex(0x1a)).toBe('0000001A');
    expect(crcEmHex(0xffffffff)).toBe('FFFFFFFF');
    expect(crcEmHex(-1)).toBe('FFFFFFFF');
  });
});
