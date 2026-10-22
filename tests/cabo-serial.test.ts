/**
 * Leitura da porta serial (feature 004) contra uma porta falsa que entrega
 * bytes em pedaços arbitrários — o mesmo formato que o Chrome entrega — e que
 * reproduz os três problemas da bancada: cabo que sai, bytes perdidos e placa
 * que para de mandar.
 */
import { describe, expect, it } from 'vitest';
import { TransportError } from '@/core/ports/transport';
import {
  abrirLeitura, escolherPorta, type PortaSerial, type SerialDoNavegador,
} from '@/transports/cable/serial';
import { disponibilidadeDoCabo, type AmbienteDoCabo } from '@/transports/cable/disponibilidade';
import { ehErroNaoFatalDeLeitura, paraTransportError } from '@/transports/cable/erros';
import type { LinhaRecebida } from '@/transports/cable/linhas';

const L1 = 'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm';
const cod = new TextEncoder();

class PortaFalsa implements PortaSerial {
  abertaCom: number | null = null;
  fechada = false;
  falharAoAbrir: unknown = null;
  private ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  private fluxo: ReadableStream<Uint8Array> | null = null;

  get readable() { return this.fluxo; }

  async open(o: { baudRate: number }) {
    if (this.falharAoAbrir) throw this.falharAoAbrir;
    this.abertaCom = o.baudRate;
    this.novoFluxo();
  }

  async close() {
    // Como a porta de verdade: não fecha com o fluxo preso a um leitor.
    if (this.fluxo?.locked) throw new TypeError('fluxo preso');
    this.fechada = true;
    this.fluxo = null;
  }

  private novoFluxo() {
    this.fluxo = new ReadableStream<Uint8Array>({ start: (c) => { this.ctrl = c; } });
  }

  enviar(dado: string | Uint8Array) {
    this.ctrl?.enqueue(typeof dado === 'string' ? cod.encode(dado) : dado);
  }

  /** Bytes perdidos: o fluxo dá erro e a porta oferece um fluxo novo. */
  perderBytes(nome = 'BufferOverrunError') {
    this.ctrl?.error(new DOMException('perdeu', nome));
    this.novoFluxo();
  }

  arrancarCabo() {
    this.ctrl?.error(new DOMException('The device has been lost.', 'NetworkError'));
    this.fluxo = null;
  }
}

const tique = (ms = 5) => new Promise((r) => setTimeout(r, ms));

async function abrir(porta: PortaFalsa, extra: { silencioMaximoMs?: number; aoReceber?: (l: LinhaRecebida) => void } = {}) {
  const linhas: LinhaRecebida[] = [];
  const leitura = await abrirLeitura(porta, {
    aoReceberLinha: (l) => { extra.aoReceber?.(l); if (l.texto !== '') linhas.push(l); },
    silencioMaximoMs: extra.silencioMaximoMs ?? 10_000,
    vigiaMs: 5,
  });
  return { leitura, linhas };
}

describe('ler a porta', () => {
  it('abre a 115200 e junta linhas partidas, inclusive o acento partido ao meio', async () => {
    const porta = new PortaFalsa();
    const { leitura, linhas } = await abrir(porta);
    expect(porta.abertaCom).toBe(115200);

    const bytes = cod.encode(`Aguardando estabilização\r\n${L1}\r\n`);
    const meioDoCedilha = bytes.indexOf(0xc3) + 1; // 'ç' é C3 A7 em UTF-8
    porta.enviar(bytes.slice(0, meioDoCedilha));
    await tique();
    porta.enviar(bytes.slice(meioDoCedilha, 40));
    await tique();
    porta.enviar(bytes.slice(40));
    await tique();

    expect(linhas).toEqual([
      { texto: 'Aguardando estabilização', corte: null },
      { texto: L1, corte: null },
    ]);
    await leitura.fechar();
  });

  it('desconectar libera a porta e termina "pela pessoa"', async () => {
    const porta = new PortaFalsa();
    const { leitura } = await abrir(porta);
    porta.enviar(`${L1}\r\n`);
    await tique();
    await leitura.fechar();
    expect(porta.fechada).toBe(true);
    expect(await leitura.fim).toEqual({ tipo: 'pela-pessoa' });
  });

  it('cabo que sai vira connection-lost, e a linha pela metade sai como interrompida', async () => {
    const porta = new PortaFalsa();
    const { leitura, linhas } = await abrir(porta);
    porta.enviar(`${L1}\r\nT=34.5`);
    await tique();
    porta.arrancarCabo();
    const fim = await leitura.fim;
    expect(fim.tipo).toBe('problema');
    if (fim.tipo === 'problema') {
      expect(fim.erro).toBeInstanceOf(TransportError);
      expect(fim.erro.code).toBe('connection-lost');
    }
    expect(linhas).toEqual([
      { texto: L1, corte: null },
      { texto: 'T=34.5', corte: 'interrompida' },
    ]);
    // Fechar depois do fim não lança nem trava.
    await expect(leitura.fechar()).resolves.toBeUndefined();
  });

  it('bytes perdidos não derrubam a leitura', async () => {
    const porta = new PortaFalsa();
    const { leitura, linhas } = await abrir(porta);
    porta.enviar('T=34.52C RH=6');
    await tique();
    porta.perderBytes('BufferOverrunError');
    await tique();
    porta.enviar(`${L1}\r\n`);
    await tique();
    porta.perderBytes('FramingError');
    await tique();
    porta.enviar(`AHT20 OK\r\n`);
    await tique();

    expect(linhas).toEqual([
      { texto: 'T=34.52C RH=6', corte: 'interrompida' },
      { texto: L1, corte: null },
      { texto: 'AHT20 OK', corte: null },
    ]);
    await leitura.fechar();
    expect(await leitura.fim).toEqual({ tipo: 'pela-pessoa' });
  });

  it('placa em silêncio vira timeout e a porta é liberada', async () => {
    const porta = new PortaFalsa();
    const { leitura } = await abrir(porta, { silencioMaximoMs: 30 });
    const fim = await leitura.fim;
    expect(fim).toMatchObject({ tipo: 'problema' });
    if (fim.tipo === 'problema') expect(fim.erro.code).toBe('timeout');
    expect(porta.fechada).toBe(true);
  });

  it('enquanto chega byte, não é silêncio', async () => {
    const porta = new PortaFalsa();
    const { leitura, linhas } = await abrir(porta, { silencioMaximoMs: 40 });
    for (let i = 0; i < 8; i++) {
      porta.enviar(`${L1}\r\n`);
      await tique(15);
    }
    expect(linhas).toHaveLength(8);
    await leitura.fechar();
    expect(await leitura.fim).toEqual({ tipo: 'pela-pessoa' });
  });

  it('um defeito em quem recebe a linha não para a leitura', async () => {
    const porta = new PortaFalsa();
    let chamadas = 0;
    const { leitura, linhas } = await abrir(porta, {
      aoReceber: () => { chamadas++; if (chamadas === 1) throw new Error('tela quebrou'); },
    });
    porta.enviar(`a\nb\n`);
    await tique();
    porta.enviar(`c\n`);
    await tique();
    // 'a' quebrou quem recebia; 'b' e 'c' chegaram mesmo assim.
    expect(chamadas).toBe(3);
    expect(linhas.map((l) => l.texto)).toEqual(['b', 'c']);
    await leitura.fechar();
    expect(await leitura.fim).toEqual({ tipo: 'pela-pessoa' });
  });

  it('porta ocupada por outro programa: abrir lança unavailable', async () => {
    const porta = new PortaFalsa();
    porta.falharAoAbrir = new DOMException('Failed to open serial port.', 'NetworkError');
    await expect(abrirLeitura(porta, { aoReceberLinha: () => {} }))
      .rejects.toMatchObject({ name: 'TransportError', code: 'unavailable' });
  });
});

describe('escolher a porta', () => {
  const serialQue = (falha: unknown): SerialDoNavegador => ({
    requestPort: async () => { throw falha; },
  });

  it('pessoa fechou a lista sem escolher: not-found', async () => {
    await expect(escolherPorta(serialQue(new DOMException('No port selected by the user.', 'NotFoundError'))))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('navegador não deixou pedir a porta: permission', async () => {
    await expect(escolherPorta(serialQue(new DOMException('nope', 'SecurityError'))))
      .rejects.toMatchObject({ code: 'permission' });
  });

  it('sem porta serial nenhuma: unavailable, sem chamar nada', async () => {
    await expect(escolherPorta(null)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('a porta escolhida volta como veio', async () => {
    const porta = new PortaFalsa();
    await expect(escolherPorta({ requestPort: async () => porta })).resolves.toBe(porta);
  });
});

describe('erros da porta', () => {
  it('só os quatro erros de bytes perdidos são não fatais', () => {
    for (const n of ['BreakError', 'FramingError', 'ParityError', 'BufferOverrunError']) {
      expect(ehErroNaoFatalDeLeitura(new DOMException('x', n))).toBe(true);
    }
    for (const n of ['NetworkError', 'UnknownError', 'InvalidStateError']) {
      expect(ehErroNaoFatalDeLeitura(new DOMException('x', n))).toBe(false);
    }
    expect(ehErroNaoFatalDeLeitura('texto')).toBe(false);
    expect(ehErroNaoFatalDeLeitura(null)).toBe(false);
  });

  it('a mensagem do navegador nunca vira o texto: sempre TransportError com código', () => {
    const e = paraTransportError(new Error('Something in English'), 'ler');
    expect(e).toBeInstanceOf(TransportError);
    expect(e.code).toBe('connection-lost');
    expect(e.message).not.toContain('English');
    const ja = new TransportError('timeout');
    expect(paraTransportError(ja, 'abrir')).toBe(ja);
  });
});

describe('onde dá para ler pelo cabo', () => {
  const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 9; SM-J260M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
  const amb = (over: Partial<AmbienteDoCabo> = {}): AmbienteDoCabo => ({
    plataforma: 'web', temPortaSerial: true, contextoSeguro: true, userAgent: CHROME_MAC, ...over,
  });

  it('Chrome ou Edge de computador, em endereço seguro: dá', () => {
    expect(disponibilidadeDoCabo(amb())).toEqual({ ok: true });
  });

  it('app instalado no celular', () => {
    expect(disponibilidadeDoCabo(amb({ plataforma: 'android' }))).toEqual({ ok: false, motivo: 'app-no-celular' });
    expect(disponibilidadeDoCabo(amb({ plataforma: 'ios' }))).toEqual({ ok: false, motivo: 'app-no-celular' });
  });

  it('navegador de celular, mesmo que diga ter porta serial', () => {
    expect(disponibilidadeDoCabo(amb({ userAgent: CHROME_ANDROID })))
      .toEqual({ ok: false, motivo: 'navegador-de-celular' });
    expect(disponibilidadeDoCabo(amb({ celularPelaDica: true })))
      .toEqual({ ok: false, motivo: 'navegador-de-celular' });
  });

  it('endereço não seguro tem motivo próprio, porque a solução é outra', () => {
    expect(disponibilidadeDoCabo(amb({ contextoSeguro: false, temPortaSerial: false })))
      .toEqual({ ok: false, motivo: 'endereco-nao-seguro' });
  });

  it('Firefox ou Safari de computador', () => {
    expect(disponibilidadeDoCabo(amb({ temPortaSerial: false })))
      .toEqual({ ok: false, motivo: 'navegador-sem-porta-serial' });
  });
});
