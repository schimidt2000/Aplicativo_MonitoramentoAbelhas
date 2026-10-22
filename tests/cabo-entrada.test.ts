/**
 * O leitor de bytes do cabo (feature 005, D-505): modo linha e modo "N bytes
 * exatos" sobre o mesmo fluxo, sem perder nem reler nenhum byte entre os dois.
 */
import { describe, expect, it } from 'vitest';
import { EntradaDeBytes } from '@/transports/cable/entrada';
import { LeituraIncompletaError } from '@/core/ports/canal';
import { TransportError } from '@/core/ports/transport';

const b = (s: string) => new TextEncoder().encode(s);
const juntar = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((a, p) => a + p.length, 0));
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
};
/** Binário que contém LF, CR e bytes altos — o pior caso para quem trata como texto. */
const BINARIO = Uint8Array.from([0x0a, 0x0d, 0x00, 0xff, 0x0a, 0x46, 0x49, 0x0d, 0x0a, 0x80, 0xc3]);

describe('EntradaDeBytes', () => {
  it('FILE_INFO e o começo do arquivo no mesmo pedaço: nenhum byte se perde', async () => {
    const e = new EntradaDeBytes();
    e.empurrar(juntar(b('Handshake estabelecido!\r\nFILE_INFO:11:ABCDEF01\n'), BINARIO.subarray(0, 4)));
    expect(await e.lerLinha(100)).toBe('Handshake estabelecido!');
    expect(await e.lerLinha(100)).toBe('FILE_INFO:11:ABCDEF01');
    const leitura = e.lerBytes(11, 100);
    e.empurrar(juntar(BINARIO.subarray(4), b('TRANSFER_OK\r\n')));
    expect(await leitura).toEqual(BINARIO);
    // O que veio depois do arquivo continua lá, para o modo linha.
    expect(await e.lerLinha(100)).toBe('TRANSFER_OK');
    expect(e.pendentes).toBe(0);
  });

  it('pedaços de 1 byte, em qualquer ponto de corte', async () => {
    const tudo = juntar(b('READY\r\nFILE_INFO:11:00000000\n'), BINARIO, b('REQUEST_TIMESTAMP\r\n'));
    for (let tamanho = 1; tamanho <= 7; tamanho++) {
      const e = new EntradaDeBytes();
      for (let i = 0; i < tudo.length; i += tamanho) e.empurrar(tudo.subarray(i, i + tamanho));
      expect(await e.lerLinha(50)).toBe('READY');
      expect(await e.lerLinha(50)).toBe('FILE_INFO:11:00000000');
      expect(await e.lerBytes(11, 50)).toEqual(BINARIO);
      expect(await e.lerLinha(50)).toBe('REQUEST_TIMESTAMP');
    }
  });

  it('só LF encerra a linha; um CR sozinho não (o byte seguinte pode ser binário)', async () => {
    const e = new EntradaDeBytes();
    e.empurrar(b('A\rB\r\nC\n'));
    expect(await e.lerLinha(50)).toBe('A\rB');
    expect(await e.lerLinha(50)).toBe('C');
  });

  it('copia o pedaço: a porta pode reaproveitar o buffer', async () => {
    const e = new EntradaDeBytes();
    const buf = b('OK\n');
    e.empurrar(buf);
    buf.fill(0x58);
    expect(await e.lerLinha(50)).toBe('OK');
  });

  it('linha longa demais sem fim de linha é descartada até o próximo LF', async () => {
    const e = new EntradaDeBytes();
    e.empurrar(new Uint8Array(600).fill(0x41));
    e.empurrar(b('AAAA\nREADY\n'));
    expect(await e.lerLinha(50)).toBe('READY');
  });

  it('prazo da linha: timeout; prazo do binário conta do último byte (silêncio)', async () => {
    const e = new EntradaDeBytes();
    await expect(e.lerLinha(20)).rejects.toMatchObject({ code: 'timeout' });
    const leitura = e.lerBytes(4, 60);
    // Bytes chegando a cada 30 ms: com prazo de silêncio de 60 ms, não estoura.
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 30));
      e.empurrar(Uint8Array.of(i));
    }
    expect(await leitura).toEqual(Uint8Array.of(0, 1, 2, 3));
    const parada = e.lerBytes(4, 30);
    e.empurrar(Uint8Array.of(9));
    const erro = await parada.catch((x) => x);
    expect(erro).toBeInstanceOf(LeituraIncompletaError);
    expect(erro.code).toBe('timeout');
    expect(erro.parcial).toEqual(Uint8Array.of(9));
  });

  it('a porta caiu no meio do arquivo: connection-lost com o que chegou', async () => {
    const e = new EntradaDeBytes();
    const leitura = e.lerBytes(10, 1000);
    e.empurrar(Uint8Array.of(1, 2, 3));
    e.encerrar(new TransportError('connection-lost', 'cabo'));
    const erro = await leitura.catch((x) => x);
    expect(erro).toBeInstanceOf(LeituraIncompletaError);
    expect(erro.code).toBe('connection-lost');
    expect(erro.parcial).toEqual(Uint8Array.of(1, 2, 3));
  });

  it('o que chegou antes de a porta cair ainda é lido; depois, o erro', async () => {
    const e = new EntradaDeBytes();
    e.empurrar(b('SESSION_COMPLETE\r\n'));
    e.encerrar(new TransportError('connection-lost', 'dormiu'));
    expect(await e.lerLinha(50)).toBe('SESSION_COMPLETE');
    await expect(e.lerLinha(50)).rejects.toMatchObject({ code: 'connection-lost' });
    e.empurrar(b('ignorado\n'));
    expect(e.pendentes).toBe(0);
  });

  it('zero bytes pedidos: devolve na hora', async () => {
    expect(await new EntradaDeBytes().lerBytes(0, 10)).toEqual(new Uint8Array(0));
  });
});
