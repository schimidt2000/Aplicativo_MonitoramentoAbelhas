/**
 * A porta serial do navegador (Web Serial) para a COLETA pelo cabo (feature
 * 005). Junto com `./serial.ts` (monitor de bancada da 004), é o único código
 * do app que toca a porta — `scripts/check-fronteira.sh` reprova o resto.
 *
 * O que muda em relação à 004:
 *  - lê BYTES e entrega numa `EntradaDeBytes`, porque depois do `FILE_INFO`
 *    vem binário (D-505);
 *  - escreve na porta (HELLO, GET_FILE, RECEIVED, a hora);
 *  - a porta SOME quando a placa dorme e reaparece quando ela acorda (USB
 *    nativa do ESP32-C6, D-512): a placa já autorizada é achada por
 *    `getPorts()` e pelo evento `connect`, sem a lista do navegador.
 *
 * Os sinais DTR/RTS não são tocados: dependendo da combinação, abrir a porta
 * pode reiniciar o chip, e mexer neles poderia justamente provocar isso. Risco
 * registrado em docs/integracao-firmware.md, a verificar com a placa.
 *
 * Todo erro sai como `TransportError` com código (`./erros.ts`).
 */
import { TransportError } from '@/core/ports/transport';
import type { CanalSerial } from '@/core/ports/canal';
import { EntradaDeBytes, canalSobre } from './entrada';
import { ehErroNaoFatalDeLeitura, paraTransportError } from './erros';
import { VELOCIDADE_DA_PLACA } from './serial';

/** O que usamos de `SerialPort` na coleta. */
export interface PortaDeColeta {
  open(opcoes: {
    baudRate: number; dataBits?: number; stopBits?: number;
    parity?: 'none' | 'even' | 'odd'; flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

/** O que usamos de `navigator.serial` na coleta. */
export interface SerialDeColeta {
  requestPort(opcoes?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<PortaDeColeta>;
  getPorts(): Promise<PortaDeColeta[]>;
  addEventListener(tipo: 'connect' | 'disconnect', fn: (e: Event) => void): void;
  removeEventListener(tipo: 'connect' | 'disconnect', fn: (e: Event) => void): void;
}

/** A placa que este endereço já pode usar e que está ligada agora (acordada), ou null. */
export async function portaJaAutorizada(serial: SerialDeColeta | null): Promise<PortaDeColeta | null> {
  if (!serial) return null;
  try {
    const portas = await serial.getPorts();
    return portas[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Avisa quando uma placa autorizada aparece (a placa acordou pelo botão).
 * Devolve a função que para de vigiar.
 */
export function vigiarPortas(
  serial: SerialDeColeta | null,
  aoAparecer: (p: PortaDeColeta) => void,
  aoSumir?: (p: PortaDeColeta) => void,
): () => void {
  if (!serial) return () => {};
  const apareceu = (e: Event) => { try { aoAparecer(e.target as unknown as PortaDeColeta); } catch { /* a tela segue */ } };
  // A placa voltou a dormir: a porta some.
  const sumiu = (e: Event) => { try { aoSumir?.(e.target as unknown as PortaDeColeta); } catch { /* a tela segue */ } };
  serial.addEventListener('connect', apareceu);
  serial.addEventListener('disconnect', sumiu);
  return () => {
    serial.removeEventListener('connect', apareceu);
    serial.removeEventListener('disconnect', sumiu);
  };
}

/** Espera uma placa autorizada aparecer, até `prazoMs`. Lança TransportError('timeout'). */
export function aguardarPorta(serial: SerialDeColeta | null, prazoMs: number): Promise<PortaDeColeta> {
  if (!serial) return Promise.reject(new TransportError('unavailable', 'sem porta serial'));
  return new Promise((resolve, reject) => {
    const parar = vigiarPortas(serial, (p) => { clearTimeout(id); parar(); resolve(p); });
    const id = setTimeout(() => { parar(); reject(new TransportError('timeout', 'a placa não apareceu')); }, prazoMs);
  });
}

/**
 * A lista de portas do navegador. Tem de ser chamada direto do toque. Lança
 * TransportError (`not-found` quando a pessoa fecha a lista sem escolher).
 */
export async function escolherPortaDeColeta(serial: SerialDeColeta | null): Promise<PortaDeColeta> {
  if (!serial) throw new TransportError('unavailable', 'escolher: sem porta serial');
  try {
    // Sem filtro de fabricante: o identificador USB da placa não está confirmado.
    return await serial.requestPort();
  } catch (e) {
    throw paraTransportError(e, 'escolher');
  }
}

/** Abre a porta a 115200 8N1 e devolve a `CanalSerial` da conversa. */
export async function abrirCanal(porta: PortaDeColeta): Promise<CanalSerial> {
  try {
    await porta.open({ baudRate: VELOCIDADE_DA_PLACA, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  } catch (e) {
    throw paraTransportError(e, 'abrir');
  }

  const entrada = new EntradaDeBytes();
  let leitor: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let fechando = false;

  const bomba = (async () => {
    while (!fechando) {
      const fluxo = porta.readable;
      if (!fluxo) {
        entrada.encerrar(new TransportError('connection-lost', 'ler: porta sem fluxo'));
        return;
      }
      leitor = fluxo.getReader();
      try {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          if (value && value.length > 0) entrada.empurrar(value);
        }
        if (!fechando) {
          entrada.encerrar(new TransportError('connection-lost', 'ler: fluxo terminou'));
          return;
        }
      } catch (e) {
        if (fechando) return;
        // Bytes perdidos ou estragados: segue lendo. Se foi no meio do arquivo,
        // o CRC não fecha e nada é gravado.
        if (!ehErroNaoFatalDeLeitura(e)) {
          entrada.encerrar(paraTransportError(e, 'ler'));
          return;
        }
      } finally {
        try { leitor?.releaseLock(); } catch { /* já solto */ }
        leitor = null;
      }
    }
  })();

  const escrever = async (bytes: Uint8Array) => {
    const fluxo = porta.writable;
    if (!fluxo) throw new TransportError('connection-lost', 'escrever: porta sem fluxo');
    const escritor = fluxo.getWriter();
    try {
      await escritor.write(bytes);
    } catch {
      throw new TransportError('connection-lost', 'escrever');
    } finally {
      try { escritor.releaseLock(); } catch { /* já solto */ }
    }
  };

  const soltar = async () => {
    if (fechando) return;
    fechando = true;
    try { await leitor?.cancel(); } catch { /* a porta pode já ter sumido */ }
    await bomba;
    try { await porta.close(); } catch { /* cabo já fora */ }
    entrada.encerrar(new TransportError('connection-lost', 'porta fechada pelo app'));
  };

  return canalSobre(entrada, escrever, soltar);
}
