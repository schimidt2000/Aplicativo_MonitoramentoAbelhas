/**
 * O cabo pela porta USB do Android (feature 006), sem aparelho: um módulo
 * nativo falso, com a mesma cara de `modules/bee-usb-serial`, ligado à placa
 * simulada do firmware 4cc7ed8. Os bytes da placa chegam UM A UM, em eventos,
 * como o pior caso da thread de leitura nativa. Por cima, a mesma coleta da 005.
 */
import { describe, expect, it } from 'vitest';
import { coletarPeloCabo } from '@/data/coletaCabo';
import { contarLeituras, garantirApiario, garantirColmeia } from '@/data/repo';
import { caboDoAparelho } from '@/transports/cable/android';
import { deBase64, paraBase64 } from '@/transports/cable/base64';
import { disponibilidadeDoCabo } from '@/transports/cable/disponibilidade';
import { problemaDaPortaPorErro } from '@/core/cabo/mensagens';
import { TransportError } from '@/core/ports/transport';
import type { CanalSerial } from '@/core/ports/canal';
import {
  PlacaSimulada, TEMPOS_DE_TESTE, arquivoDaPlaca, macSimulado, type FalhasDaPlaca,
} from '@/transports/mock/firmware';
import type { ModuloUsbSerial, PlacaUsb } from '../modules/bee-usb-serial';
import { bancoDeTeste } from './apoio/banco';

const AGORA = Date.UTC(2026, 10, 4, 15);
const T0 = AGORA / 1000 - 36 * 7200 - 1800;
const CONFIG = {
  escutaInicialMs: 30, esperaPelaPlacaMs: 600, reenviarHelloMs: 150, prazoRespostaMs: 250, silencioMaximoMs: 150,
};

type Ouvinte = (e: never) => void;

/** O módulo nativo falso: uma placa na "porta USB", acordada pelo botão ao abrir. */
class ModuloFalso implements ModuloUsbSerial {
  ligada = true;
  permitida = false;
  concedeLicenca = true;
  pedidosDeLicenca = 0;
  private nomeAtual = '/dev/bus/usb/001/002';
  private ouvintes = new Map<string, Set<Ouvinte>>();
  private canais = new Map<number, CanalSerial>();
  private proxima = 1;
  terminou: Promise<void> = Promise.resolve();

  constructor(readonly placa: PlacaSimulada) {}

  /** A placa dormiu e acordou: volta com outro nome e sem licença. */
  reaparecer() {
    this.nomeAtual = this.nomeAtual.replace(/\d+$/, (n) => String(Number(n) + 1));
    this.permitida = false;
    this.ligada = true;
  }

  listar(): PlacaUsb[] {
    return this.ligada ? [{ nome: this.nomeAtual, vid: 0x303a, pid: 0x1001, permitida: this.permitida }] : [];
  }

  async pedirPermissao(nome: string) {
    this.pedidosDeLicenca++;
    if (nome !== this.nomeAtual) return false;
    this.permitida = this.concedeLicenca;
    return this.permitida;
  }

  async abrir(nome: string) {
    if (!this.ligada || nome !== this.nomeAtual) throw Object.assign(new Error('x'), { code: 'ERR_SEM_PLACA' });
    if (!this.permitida) throw Object.assign(new Error('x'), { code: 'ERR_SEM_PERMISSAO' });
    const alca = this.proxima++;
    const { canal, terminou } = this.placa.acordar('botao');
    this.terminou = terminou;
    this.canais.set(alca, canal);
    void this.bombear(alca, canal);
    return alca;
  }

  /** Byte a byte, como o pior caso da thread nativa. */
  private async bombear(alca: number, canal: CanalSerial) {
    for (;;) {
      let b: Uint8Array;
      try {
        b = await canal.lerBytes(1, 5_000);
      } catch {
        this.canais.delete(alca);
        this.emitir('onFim', { alca, motivo: 'sumiu' });
        return;
      }
      this.emitir('onDados', { alca, b64: paraBase64(b) });
    }
  }

  async escrever(alca: number, base64: string) {
    const canal = this.canais.get(alca);
    if (!canal) throw Object.assign(new Error('x'), { code: 'ERR_FECHADA' });
    await canal.escrever(new TextDecoder().decode(deBase64(base64)));
  }

  async fechar(alca: number) {
    const canal = this.canais.get(alca);
    this.canais.delete(alca);
    await canal?.fechar();
  }

  addListener(evento: string, fn: Ouvinte) {
    const set = this.ouvintes.get(evento) ?? new Set();
    set.add(fn);
    this.ouvintes.set(evento, set);
    return { remove: () => set.delete(fn) };
  }

  private emitir(evento: string, e: unknown) {
    for (const fn of this.ouvintes.get(evento) ?? []) (fn as (x: unknown) => void)(e);
  }
}

function banco() {
  const db = bancoDeTeste();
  garantirApiario(db, 'ap', 'Meliponário Serra Verde');
  garantirColmeia(db, 'h1', 'ap', 'Colmeia 03');
  return db;
}

function placa(n = 37, falhas: FalhasDaPlaca = {}) {
  return new PlacaSimulada({ arquivo: arquivoDaPlaca(T0, n), falhas, tempos: TEMPOS_DE_TESTE });
}

async function coletarNoAparelho(db: ReturnType<typeof banco>, m: ModuloFalso) {
  const cabo = caboDoAparelho(m as unknown as ModuloUsbSerial, { intervaloMs: 10 });
  const porta = await cabo.escolher();
  const canal = await cabo.abrir(porta);
  const r = await coletarPeloCabo(db, canal, { hiveId: 'h1', agora: () => AGORA, config: CONFIG, src: 'cable' });
  await m.terminou;
  return r;
}

describe('coleta pelo cabo no Android (módulo falso, placa simulada)', () => {
  it('coleta completa: pede a licença no abrir, grava, confirma, a placa recomeça', async () => {
    const db = banco();
    const p = placa();
    const m = new ModuloFalso(p);
    const r = await coletarNoAparelho(db, m);
    expect(m.pedidosDeLicenca).toBe(1);
    expect(r.nos[0]).toMatchObject({ inseridas: 37, problema: null });
    expect(r.nos[0].cabo?.desfecho).toMatchObject({ motivo: 'concluida', arquivoNaPlaca: 'apagou' });
    expect(contarLeituras(db)).toBe(37);
    expect(p.inicioS).toBe(AGORA / 1000);
    expect(db.all('SELECT mac FROM node')).toEqual([{ mac: macSimulado(1) }]);
  });

  it('a mesma placa de novo, depois de dormir e voltar com outro nome: pede licença outra vez e não repete nada', async () => {
    const db = banco();
    const p = placa();
    const m = new ModuloFalso(p);
    await coletarNoAparelho(db, m);
    p.medirSemPorta(2);
    m.reaparecer();
    const r = await coletarNoAparelho(db, m);
    expect(m.pedidosDeLicenca).toBe(2);
    expect(r.nos[0].inseridas).toBe(3);
    expect(contarLeituras(db)).toBe(40);
  });

  it('licença negada: nada aberto, problema do aparelho (não o do navegador)', async () => {
    const m = new ModuloFalso(placa());
    m.concedeLicenca = false;
    const cabo = caboDoAparelho(m as unknown as ModuloUsbSerial);
    const porta = await cabo.escolher();
    const erro = await cabo.abrir(porta).catch((e) => e);
    expect(erro).toBeInstanceOf(TransportError);
    expect(erro.code).toBe('permission');
    expect(problemaDaPortaPorErro(erro.code, 'abrir', cabo.origem)).toBe('sem-permissao-usb');
  });

  it('nenhuma placa no cabo: "a placa não apareceu", sem lista para escolher', async () => {
    const m = new ModuloFalso(placa());
    m.ligada = false;
    const cabo = caboDoAparelho(m as unknown as ModuloUsbSerial);
    const erro = await cabo.escolher().catch((e) => e);
    expect(erro.code).toBe('not-found');
    expect(problemaDaPortaPorErro(erro.code, 'escolher', cabo.origem)).toBe('nao-apareceu');
    // No navegador continua sendo "nenhuma placa foi escolhida".
    expect(problemaDaPortaPorErro('not-found', 'escolher')).toBe('nenhuma');
  });

  it('cabo solto no meio do arquivo: nada gravado na série, a placa fica com tudo', async () => {
    const db = banco();
    const p = placa(37, { caboPuxadoNaFracao: 0.5 });
    const m = new ModuloFalso(p);
    const r = await coletarNoAparelho(db, m);
    expect(r.nos[0].problema).toBe('conexao-caiu');
    expect(contarLeituras(db)).toBe(0);
    expect(p.inicioS).toBe(T0);
  });

  it('vigia: avisa quando a placa aparece e quando some, com o mesmo objeto', async () => {
    const m = new ModuloFalso(placa());
    m.ligada = false;
    const cabo = caboDoAparelho(m as unknown as ModuloUsbSerial, { intervaloMs: 5 });
    const eventos: string[] = [];
    let vista: object | null = null;
    const parar = cabo.vigiar((p) => { vista = p; eventos.push('apareceu'); }, (p) => {
      eventos.push(p === vista ? 'sumiu' : 'sumiu-outra');
    });
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await espera(20);
    m.ligada = true;
    await espera(30);
    m.ligada = false;
    await espera(30);
    parar();
    expect(eventos).toEqual(['apareceu', 'sumiu']);
  });
});

describe('disponibilidade da coleta pelo cabo', () => {
  const base = { temPortaSerial: false, contextoSeguro: true, userAgent: 'Mozilla/5.0 (Linux; Android 14)' };
  it('Android com o módulo de USB: disponível', () => {
    expect(disponibilidadeDoCabo({ ...base, plataforma: 'android', temUsbNativo: true })).toEqual({ ok: true });
  });
  it('Android sem o módulo (Expo Go): explica o caminho', () => {
    expect(disponibilidadeDoCabo({ ...base, plataforma: 'android', temUsbNativo: false }))
      .toEqual({ ok: false, motivo: 'app-no-celular' });
  });
  it('iOS: continua sem cabo', () => {
    expect(disponibilidadeDoCabo({ ...base, plataforma: 'ios', temUsbNativo: true }))
      .toEqual({ ok: false, motivo: 'app-no-celular' });
  });
});

describe('base64 do cabo', () => {
  it('ida e volta com todos os bytes e todos os restos', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 0xff);
      expect(deBase64(paraBase64(b))).toEqual(b);
    }
    expect(paraBase64(new TextEncoder().encode('HELLO\n'))).toBe('SEVMTE8K');
    expect(new TextDecoder().decode(deBase64('SEVMTE8K'))).toBe('HELLO\n');
  });
});
