/**
 * A Web Serial da coleta (feature 005, `src/transports/cable/coleta.ts`)
 * contra uma porta falsa no formato do Chrome: `readable`/`writable` de
 * verdade, pedaços arbitrários, erro não fatal, cabo que sai, o evento
 * `connect` da placa que acorda. Uma placa "de roteiro" responde às linhas
 * que o app escreve, e a conversa inteira roda por cima.
 */
import { describe, expect, it } from 'vitest';
import {
  abrirCanal, aguardarPorta, escolherPortaDeColeta, portaJaAutorizada, vigiarPortas,
  type PortaDeColeta, type SerialDeColeta,
} from '@/transports/cable/coleta';
import { executarSessao } from '@/core/cabo/sessao';
import { crc32, crcEmHex } from '@/core/cabo/crc32';
import { arquivoDaPlaca } from '@/transports/mock/firmware';

const cod = new TextEncoder();
const tique = (ms = 5) => new Promise((r) => setTimeout(r, ms));

class PortaFalsa implements PortaDeColeta {
  abertaCom: Record<string, unknown> | null = null;
  fechada = false;
  falharAoAbrir: unknown = null;
  escrito = '';
  /** Responde a cada linha que o app escreve. */
  responder: (linha: string, porta: PortaFalsa) => void = () => {};
  private ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  private fluxo: ReadableStream<Uint8Array> | null = null;
  private pendente = '';
  readonly writable: WritableStream<Uint8Array>;

  constructor() {
    this.writable = new WritableStream<Uint8Array>({
      write: (bytes) => {
        if (!this.fluxo) throw new DOMException('The device has been lost.', 'NetworkError');
        const texto = new TextDecoder().decode(bytes);
        this.escrito += texto;
        this.pendente += texto;
        let i: number;
        while ((i = this.pendente.indexOf('\n')) !== -1) {
          const linha = this.pendente.slice(0, i);
          this.pendente = this.pendente.slice(i + 1);
          this.responder(linha, this);
        }
      },
    });
  }

  get readable() { return this.fluxo; }

  async open(o: Record<string, unknown>) {
    if (this.falharAoAbrir) throw this.falharAoAbrir;
    this.abertaCom = o;
    this.novoFluxo();
  }

  async close() {
    if (this.fluxo?.locked) throw new TypeError('fluxo preso');
    this.fechada = true;
    this.fluxo = null;
  }

  private novoFluxo() {
    this.fluxo = new ReadableStream<Uint8Array>({ start: (c) => { this.ctrl = c; } });
  }

  /** Manda bytes em pedaços de tamanho variável, como a USB. */
  enviar(dado: string | Uint8Array, pedaco = 7) {
    const b = typeof dado === 'string' ? cod.encode(dado) : dado;
    for (let i = 0; i < b.length; i += pedaco) this.ctrl?.enqueue(b.slice(i, i + pedaco));
  }

  perderBytes() {
    this.ctrl?.error(new DOMException('perdeu', 'BufferOverrunError'));
    this.novoFluxo();
  }

  arrancarCabo() {
    this.ctrl?.error(new DOMException('The device has been lost.', 'NetworkError'));
    this.fluxo = null;
  }
}

class SerialFalsa implements SerialDeColeta {
  portas: PortaDeColeta[] = [];
  escolha: PortaDeColeta | Error | null = null;
  private ouvintes = new Set<(e: Event) => void>();
  async requestPort() {
    if (this.escolha instanceof Error) throw this.escolha;
    if (!this.escolha) throw new DOMException('No port selected by the user.', 'NotFoundError');
    return this.escolha;
  }
  async getPorts() { return this.portas; }
  addEventListener(_t: 'connect' | 'disconnect', fn: (e: Event) => void) { this.ouvintes.add(fn); }
  removeEventListener(_t: 'connect' | 'disconnect', fn: (e: Event) => void) { this.ouvintes.delete(fn); }
  /** A placa acordou: a porta aparece. */
  aparecer(p: PortaDeColeta) {
    this.portas = [p];
    for (const fn of this.ouvintes) fn({ target: p } as unknown as Event);
  }
  get vigias() { return this.ouvintes.size; }
}

/** Uma placa de roteiro que responde como o firmware, com o FILE_INFO e o binário no mesmo pedaço. */
function placaDeRoteiro(porta: PortaFalsa, arquivo: Uint8Array, opcoes: { perderNoArquivo?: boolean } = {}) {
  porta.responder = (linha, p) => {
    if (linha === 'HELLO') p.enviar('READY\r\nHandshake estabelecido!\r\n');
    else if (linha === 'GET_FILE') {
      const cab = cod.encode(`FILE_INFO:${arquivo.length}:${crcEmHex(crc32(arquivo))}\n`);
      const tudo = new Uint8Array(cab.length + arquivo.length);
      tudo.set(cab); tudo.set(arquivo, cab.length);
      if (opcoes.perderNoArquivo) {
        p.enviar(tudo.subarray(0, cab.length + 10), 64);
        setTimeout(() => { p.perderBytes(); p.enviar(arquivo.subarray(20), 64); }, 5);
      } else {
        p.enviar(tudo, 64);
      }
    } else if (linha.startsWith('RECEIVED:')) p.enviar('TRANSFER_OK\r\nREQUEST_TIMESTAMP\r\n');
    else if (/^\d+$/.test(linha)) p.enviar(`Timestamp recebido: ${linha}\r\nSESSION_COMPLETE\r\n`);
  };
}

const CONFIG = { escutaInicialMs: 20, esperaPelaPlacaMs: 500, reenviarHelloMs: 200, prazoRespostaMs: 300, silencioMaximoMs: 150 };

describe('Web Serial da coleta', () => {
  it('abre a 115200 8N1, sem controle de fluxo, e a conversa inteira passa', async () => {
    const porta = new PortaFalsa();
    const arquivo = arquivoDaPlaca(1792152000, 40);
    placaDeRoteiro(porta, arquivo);
    const canal = await abrirCanal(porta);
    expect(porta.abertaCom).toEqual({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    let gravado: Uint8Array | null = null;
    const r = await executarSessao(canal, {
      gravar: async (a) => { gravado = a.bytes; return { ok: true }; },
      horaParaEnviar: () => 1792600000,
    }, { config: CONFIG });
    await canal.fechar();
    expect(r.desfecho).toMatchObject({ motivo: 'concluida', arquivoNaPlaca: 'apagou' });
    expect(gravado).toEqual(arquivo);
    expect(porta.escrito).toBe(`HELLO\nGET_FILE\nRECEIVED:${arquivo.length}:${crcEmHex(crc32(arquivo))}\n1792600000\n`);
    expect(porta.fechada).toBe(true);
  });

  it('bytes perdidos no meio do arquivo: a leitura segue, e o CRC (ou o silêncio) impede gravar', async () => {
    const porta = new PortaFalsa();
    placaDeRoteiro(porta, arquivoDaPlaca(1792152000, 40), { perderNoArquivo: true });
    const canal = await abrirCanal(porta);
    let gravou = false;
    const r = await executarSessao(canal, {
      gravar: async () => { gravou = true; return { ok: true }; }, horaParaEnviar: () => 1,
    }, { config: CONFIG });
    await canal.fechar();
    expect(gravou).toBe(false);
    expect(['crc-diferente', 'sem-resposta']).toContain(r.desfecho.motivo);
    expect(porta.escrito).not.toMatch(/RECEIVED/);
  });

  it('cabo arrancado: connection-lost, com o que chegou', async () => {
    const porta = new PortaFalsa();
    const canal = await abrirCanal(porta);
    const leitura = canal.lerBytes(100, 1000);
    porta.enviar(Uint8Array.of(1, 2, 3));
    await tique();
    porta.arrancarCabo();
    const erro = await leitura.catch((e) => e);
    expect(erro.code).toBe('connection-lost');
    expect(erro.parcial).toEqual(Uint8Array.of(1, 2, 3));
    await expect(canal.escrever('HELLO\n')).rejects.toMatchObject({ code: 'connection-lost' });
    await canal.fechar();
  });

  it('porta ocupada ao abrir vira "unavailable"; sem permissão, "permission"', async () => {
    const ocupada = new PortaFalsa();
    ocupada.falharAoAbrir = new DOMException('Failed to open serial port.', 'NetworkError');
    await expect(abrirCanal(ocupada)).rejects.toMatchObject({ code: 'unavailable' });
    const proibida = new PortaFalsa();
    proibida.falharAoAbrir = new DOMException('x', 'SecurityError');
    await expect(abrirCanal(proibida)).rejects.toMatchObject({ code: 'permission' });
  });

  it('fechar solta o leitor antes de fechar a porta, e não lança se a porta já sumiu', async () => {
    const porta = new PortaFalsa();
    const canal = await abrirCanal(porta);
    await canal.fechar();
    expect(porta.fechada).toBe(true);
    const outra = new PortaFalsa();
    const c2 = await abrirCanal(outra);
    outra.arrancarCabo();
    await expect(c2.fechar()).resolves.toBeUndefined();
  });
});

describe('a porta que some e reaparece (D-512)', () => {
  it('placa já autorizada e acordada: achada sem a lista do navegador', async () => {
    const serial = new SerialFalsa();
    expect(await portaJaAutorizada(serial)).toBeNull();
    const p = new PortaFalsa();
    serial.portas = [p];
    expect(await portaJaAutorizada(serial)).toBe(p);
    expect(await portaJaAutorizada(null)).toBeNull();
  });

  it('esperar a placa acordar: resolve no evento connect e para de vigiar', async () => {
    const serial = new SerialFalsa();
    const p = new PortaFalsa();
    const espera = aguardarPorta(serial, 500);
    await tique(10);
    serial.aparecer(p);
    expect(await espera).toBe(p);
    expect(serial.vigias).toBe(0);
  });

  it('a placa não apareceu no prazo: timeout, e para de vigiar', async () => {
    const serial = new SerialFalsa();
    await expect(aguardarPorta(serial, 20)).rejects.toMatchObject({ code: 'timeout' });
    expect(serial.vigias).toBe(0);
    await expect(aguardarPorta(null, 20)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('vigiar avisa cada vez que a placa acorda', () => {
    const serial = new SerialFalsa();
    const vistas: PortaDeColeta[] = [];
    const parar = vigiarPortas(serial, (p) => vistas.push(p));
    serial.aparecer(new PortaFalsa());
    serial.aparecer(new PortaFalsa());
    parar();
    serial.aparecer(new PortaFalsa());
    expect(vistas).toHaveLength(2);
  });

  it('escolher na lista: ninguém escolhido vira not-found', async () => {
    const serial = new SerialFalsa();
    await expect(escolherPortaDeColeta(serial)).rejects.toMatchObject({ code: 'not-found' });
    const p = new PortaFalsa();
    serial.escolha = p;
    expect(await escolherPortaDeColeta(serial)).toBe(p);
    await expect(escolherPortaDeColeta(null)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
