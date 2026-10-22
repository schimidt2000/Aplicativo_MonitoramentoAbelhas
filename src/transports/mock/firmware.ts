/**
 * A placa simulada: o `teste_de_firmware.ino` do grupo do firmware (commit
 * e93f8ad, 2026-10-21), traduzido para TypeScript linha por linha no que
 * importa para o cabo (feature 005, D-511). É a base dos testes da coleta pelo
 * cabo e a "placa simulada" da demonstração. O Princípio IV exige que ela
 * exista ANTES do transporte real: se um caminho de falha não está aqui, ele
 * não está testado.
 *
 * Fiel em: os diagnósticos na mesma serial (`Serial.println` = "\r\n"; o
 * `FILE_INFO` sai com `printf("…\n")`), `waitForHandshake` (ignora linha que
 * não é HELLO; 30 s), `readProtocolLine` (CR ignorado, 128 caracteres →
 * ERROR:BAD_COMMAND, linha vazia conta como falha), o envio em blocos de 256
 * bytes, a conferência do RECEIVED com a semântica de `strtoul`, a hora só com
 * dígitos, a troca do arquivo com cada ERROR:* no ponto em que o código o
 * emite, a medição depois da conversa (com sucesso OU falha), o primeiro boot
 * sem conversa e sem prazo, a falta de energia sem registro do buraco.
 *
 * Os prazos são parâmetros: os testes usam milissegundos; a demonstração, os
 * 30 s de verdade. A saída sai em pedaços de tamanho variável pela mesma
 * `EntradaDeBytes` do cabo real, então o leitor de bytes é exercitado inteiro.
 *
 * Nada aqui executa código do grupo do firmware: é uma tradução lida do
 * repositório deles.
 */
import { TransportError } from '@/core/ports/transport';
import type { CanalSerial } from '@/core/ports/canal';
import { crc32, crcEmHex } from '@/core/cabo/crc32';
import {
  CABECALHO_ARQUIVO_0, REGISTRO_ARQUIVO_0, codificarArquivo0, type MedicaoBruta,
} from '@/core/decode/arquivo';
import { EntradaDeBytes, canalSobre } from '../cable/entrada';

export type ErroDaTroca =
  | 'REMOVE_TEMP_FAILED' | 'TEMP_OPEN_FAILED' | 'TEMP_WRITE_FAILED'
  | 'TEMP_VERIFY_OPEN_FAILED' | 'TEMP_VERIFY_FAILED' | 'REMOVE_BACKUP_FAILED'
  | 'OLD_FILE_RENAME_FAILED' | 'NEW_FILE_RENAME_FAILED' | 'FILE_RESTORE_FAILED'
  | 'BACKUP_CLEANUP_FAILED';

export type ErroDeArquivo = 'NO_FILE' | 'FILE_OPEN_FAILED' | 'FILE_SEEK_FAILED';

/** A placa trava ANTES de mandar esta mensagem (e não manda mais nada). */
export type PontoDeTrava =
  | 'ready' | 'file-info' | 'transfer-ok' | 'request-timestamp' | 'session-complete';

/** Casos ruins que a placa sabe reproduzir. Nenhum é padrão. */
export interface FalhasDaPlaca {
  /** Simula o pedido 1: `READY:<mac>`. */
  mac?: string;
  /** Simula o pedido 2: `FILE_INFO:<tam>:<crc>:<intervalo_s>`. */
  intervaloNoFileInfo?: number;
  /** Um byte do arquivo muda no caminho (depois de a placa calcular o CRC). */
  crcErrado?: boolean;
  /** O cabo sai depois de N bytes do arquivo. */
  caboPuxadoAposBytes?: number;
  /**
   * O cabo sai no meio do arquivo, qualquer que seja o tamanho dele (fração de
   * 0 a 1). A demonstração usa este: depois da primeira coleta o arquivo da
   * placa simulada é curto, e um corte em bytes fixos nunca chegaria.
   */
  caboPuxadoNaFracao?: number;
  travaEm?: PontoDeTrava;
  erroNoArquivo?: ErroDeArquivo;
  erroNaTroca?: ErroDaTroca;
  /** A serial só começa a ouvir depois disto: os bytes de antes se perdem. */
  ouveDepoisDeMs?: number;
  /** `getNextMeasurementId` falha ao abrir o arquivo e devolve 0 (defeito do firmware). */
  idZeradoNaProximaMedicao?: boolean;
}

export interface TemposDaPlaca {
  esperaDoHandshakeMs: number;
  esperaDeLinhaMs: number;
  /** `delay(10000)` à espera do ENS160 em `performMeasurement`. */
  esperaDoSensorMs: number;
  /** `delay(3000)` antes de dormir. */
  esperaAntesDeDormirMs: number;
  /** Timeout do `readStringUntil` (padrão do Arduino: 1 s). */
  esperaDoReadStringMs: number;
  /** Maior pedaço que a USB entrega de uma vez. */
  pedacoMaximo: number;
}

/** Os tempos do .ino. */
export const TEMPOS_DA_PLACA: TemposDaPlaca = {
  esperaDoHandshakeMs: 30_000,
  esperaDeLinhaMs: 30_000,
  esperaDoSensorMs: 10_000,
  esperaAntesDeDormirMs: 3_000,
  esperaDoReadStringMs: 1_000,
  pedacoMaximo: 64,
};

/** Para os testes: a mesma placa, em milissegundos. */
export const TEMPOS_DE_TESTE: TemposDaPlaca = {
  esperaDoHandshakeMs: 400,
  esperaDeLinhaMs: 400,
  esperaDoSensorMs: 0,
  esperaAntesDeDormirMs: 0,
  esperaDoReadStringMs: 50,
  pedacoMaximo: 37,
};

export type CausaDoDespertar = 'botao' | 'temporizador' | 'desconhecida';

const LF = 0x0a;
const CR = 0x0d;
const TRANSFER_BUFFER_SIZE = 256;
const PROTOCOL_MAX_LINE_LENGTH = 128;

/** Valores de colmeia plausíveis, determinísticos pelo número da medição. */
export function medicaoSimulada(id: number, semente = 1): Omit<MedicaoBruta, 'id'> {
  const fase = (id + semente * 7) / 12;
  return {
    temperatura: 34.6 + 0.4 * Math.sin(fase * Math.PI * 2) + ((id * 31 + semente) % 7) / 100,
    umidade: 62 + 3 * Math.cos(fase * Math.PI * 2),
    eco2: 420 + ((id * 13 + semente) % 90),
    tvoc: 150 + ((id * 17 + semente * 3) % 120),
  };
}

/** Um `/measurements.bin` com `n` medições, como a placa teria gravado. */
export function arquivoDaPlaca(inicioS: number, n: number, semente = 1): Uint8Array {
  return codificarArquivo0(inicioS, Array.from({ length: n }, (_, id) => ({ ...medicaoSimulada(id, semente), id })));
}

/** `strtoul`/`strtoull` da libc: espaço, sinal, "0x" na base 16, para no primeiro inválido. */
export function strtoul(s: string, base: 10 | 16, bits: 32 | 64 = 32): { valor: number; consumiuTudo: boolean } {
  let i = 0;
  while (i < s.length && ' \t\n\v\f\r'.includes(s[i])) i++;
  let negativo = false;
  if (s[i] === '+' || s[i] === '-') { negativo = s[i] === '-'; i++; }
  if (base === 16 && s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X') && /[0-9a-fA-F]/.test(s[i + 2] ?? '')) i += 2;
  const ini = i;
  let v = 0;
  const maximo = bits === 32 ? 0xffffffff : Number.MAX_SAFE_INTEGER;
  let estourou = false;
  for (; i < s.length; i++) {
    const d = parseInt(s[i], base);
    if (Number.isNaN(d)) break;
    v = v * base + d;
    if (v > maximo) estourou = true;
  }
  // Sem nenhum dígito, o fim aponta para o começo da string.
  if (i === ini) return { valor: 0, consumiuTudo: s.length === 0 };
  if (estourou) v = maximo;
  else if (negativo && v !== 0) v = bits === 32 ? (0x100000000 - v) : maximo;
  return { valor: v, consumiuTudo: i === s.length };
}

interface Ligacao {
  /** O que o app lê. */
  doApp: EntradaDeBytes;
  /** O que a placa lê (o que o app escreveu). */
  daPlaca: EntradaDeBytes;
  aberta: boolean;
  ouveDesde: number;
  /** O app soltou a porta. Uma placa travada só "destrava" assim (nos testes). */
  soltaPeloApp: boolean;
}

export interface OpcoesPlacaSimulada {
  /** `/measurements.bin`. `null`: placa nova (primeiro boot). */
  arquivo?: Uint8Array | null;
  falhas?: FalhasDaPlaca;
  tempos?: Partial<TemposDaPlaca>;
  semente?: number;
}

export class PlacaSimulada {
  arquivo: Uint8Array | null;
  falhas: FalhasDaPlaca;
  readonly tempos: TemposDaPlaca;
  /** Tudo o que a placa imprimiu, para depurar teste. */
  readonly impresso: string[] = [];
  /** Quantas vezes ela acordou, por causa. */
  readonly despertares: CausaDoDespertar[] = [];
  private ligacao: Ligacao | null = null;
  private semente: number;
  private sorteio: number;

  constructor(opcoes: OpcoesPlacaSimulada = {}) {
    this.arquivo = opcoes.arquivo === undefined ? arquivoDaPlaca(Math.floor(Date.now() / 1000), 0) : opcoes.arquivo;
    this.falhas = opcoes.falhas ?? {};
    this.tempos = { ...TEMPOS_DA_PLACA, ...opcoes.tempos };
    this.semente = opcoes.semente ?? 1;
    this.sorteio = (this.semente * 2654435761) >>> 0;
  }

  /** Quantas medições o arquivo tem agora. */
  get medicoes(): number {
    return this.arquivo ? (this.arquivo.length - CABECALHO_ARQUIVO_0) / REGISTRO_ARQUIVO_0 : 0;
  }

  /** Hora de início do arquivo atual, ou null sem arquivo. */
  get inicioS(): number | null {
    return this.arquivo ? new DataView(this.arquivo.buffer, this.arquivo.byteOffset).getUint32(0, true) : null;
  }

  /**
   * A placa acorda (a porta USB aparece) e roda um ciclo inteiro: boot,
   * conversa se for pelo botão, medição, sono (a porta some).
   * `canal` é o lado do app; `terminou` resolve quando ela volta a dormir.
   */
  acordar(causa: CausaDoDespertar = 'botao'): { canal: CanalSerial; terminou: Promise<void> } {
    this.despertares.push(causa);
    const ligacao: Ligacao = {
      doApp: new EntradaDeBytes(),
      daPlaca: new EntradaDeBytes(),
      aberta: true,
      ouveDesde: Date.now() + (this.falhas.ouveDepoisDeMs ?? 0),
      soltaPeloApp: false,
    };
    this.ligacao = ligacao;
    const canal = canalSobre(
      ligacao.doApp,
      async (bytes) => {
        if (!ligacao.aberta) throw new TransportError('connection-lost', 'placa dormiu');
        // Antes de a serial ouvir, os bytes se perdem (D-506).
        if (Date.now() < ligacao.ouveDesde) return;
        ligacao.daPlaca.empurrar(bytes);
      },
      // O app soltou a porta; a placa segue o ciclo dela (o que ela escrever se perde).
      async () => { ligacao.soltaPeloApp = true; },
    );
    const terminou = this.ciclo(causa).finally(() => this.desligarPorta(ligacao));
    return { canal, terminou };
  }

  /**
   * Tira a placa da tomada: a porta some e o ciclo atual para onde estiver (o
   * arquivo fica como estava, como no flash). É também como um teste encerra
   * uma placa nova que esperaria a hora para sempre.
   */
  desligarDaTomada(): void {
    if (this.ligacao) this.desligarPorta(this.ligacao);
  }

  /* ---------- saída e entrada da serial ---------- */

  private proximoTamanho(): number {
    this.sorteio = (this.sorteio * 1103515245 + 12345) >>> 0;
    return 1 + (this.sorteio >>> 8) % this.tempos.pedacoMaximo;
  }

  /** Serial.write: entrega em pedaços. Devolve quantos bytes saíram (0 com a porta fechada). */
  private escreverBytes(bytes: Uint8Array): number {
    const l = this.ligacao;
    if (!l || !l.aberta) return 0;
    let k = 0;
    while (k < bytes.length) {
      const n = Math.min(this.proximoTamanho(), bytes.length - k);
      l.doApp.empurrar(bytes.subarray(k, k + n));
      k += n;
    }
    return bytes.length;
  }

  private print(texto: string) {
    this.impresso.push(texto);
    this.escreverBytes(new TextEncoder().encode(texto));
  }

  private println(texto: string) {
    this.print(`${texto}\r\n`);
  }

  private desligarPorta(l: Ligacao) {
    if (!l.aberta) return;
    l.aberta = false;
    l.doApp.encerrar(new TransportError('connection-lost', 'a placa dormiu'));
    l.daPlaca.encerrar(new TransportError('connection-lost', 'a placa dormiu'));
  }

  /** `Serial.read()` com o prazo do laço em volta. null: o prazo passou (ou a porta fechou). */
  private async lerChar(ate: number): Promise<number | null> {
    const l = this.ligacao;
    if (!l || !l.aberta) return null;
    const resta = ate - Date.now();
    if (resta <= 0) return null;
    try {
      return (await l.daPlaca.lerBytes(1, resta))[0];
    } catch {
      return null;
    }
  }

  /** Trava até o app soltar a porta (ou um teto, para nenhum teste pendurar). */
  private async travar(): Promise<void> {
    const l = this.ligacao;
    const teto = Date.now() + 10 * this.tempos.esperaDeLinhaMs;
    while (l && l.aberta && !l.soltaPeloApp && Date.now() < teto) {
      await new Promise((r) => setTimeout(r, Math.max(5, this.tempos.esperaDeLinhaMs / 20)));
    }
  }

  private dormirMs(ms: number) {
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  /* ---------- setup() e loop() ---------- */

  private async ciclo(causa: CausaDoDespertar): Promise<void> {
    // initializeSystem()
    this.println('LittleFS iniciado com sucesso!');
    let travou = false;
    if (this.arquivo) {
      this.println('Measurement file exists.');
      // normalBootSetup()
      this.println('');
      this.println('------------------');
      if (causa === 'botao') {
        this.println('Wake-up causado pelo GPIO.');
        travou = await this.handleWakeupGPIO();
      } else if (causa === 'temporizador') {
        this.println('Wake-up causado pelo timer.');
      } else {
        this.println('Wake-up causado motivo desconhecido.');
      }
    } else {
      this.println('Measurement file does not exist.');
      await this.firstBootSetup();
    }
    if (travou) return;
    // initializeSensors()
    this.println('AHT21 encontrado!');
    this.println('ENS160 encontrado!');
    this.println('ENS160 em modo padrao');
    this.println('Tamanho da struct Measurement: 16');
    // loop(): mede, grava, espera, dorme
    await this.dormirMs(this.tempos.esperaDoSensorMs);
    this.saveMeasurementToFile();
    await this.dormirMs(this.tempos.esperaAntesDeDormirMs);
    this.println('Entrando em modo de baixo consumo...');
  }

  /** Simula só a medição, sem porta (despertar pelo temporizador com ninguém no cabo). */
  medirSemPorta(vezes = 1): void {
    for (let i = 0; i < vezes; i++) this.saveMeasurementToFile();
  }

  private saveMeasurementToFile() {
    if (!this.arquivo) {
      this.println('ERRO: Arquivo de medidas nao existe!');
      return;
    }
    const id = this.getNextMeasurementId();
    const m = codificarArquivo0(0, [{ ...medicaoSimulada(id, this.semente), id }]).subarray(CABECALHO_ARQUIVO_0);
    const novo = new Uint8Array(this.arquivo.length + REGISTRO_ARQUIVO_0);
    novo.set(this.arquivo);
    novo.set(m, this.arquivo.length);
    this.arquivo = novo;
    this.println(`Medida salva com ID: ${id}`);
  }

  private getNextMeasurementId(): number {
    if (this.falhas.idZeradoNaProximaMedicao) {
      this.falhas = { ...this.falhas, idZeradoNaProximaMedicao: false };
      this.println('ERRO: nao foi possivel abrir o arquivo!');
      return 0;
    }
    const a = this.arquivo as Uint8Array;
    if (a.length === CABECALHO_ARQUIVO_0) return 0;
    return new DataView(a.buffer, a.byteOffset).getUint32(a.length - 4, true) + 1;
  }

  /* ---------- primeiro boot ---------- */

  private async firstBootSetup() {
    this.println('Aguardando timestamp inicial do dispositivo...');
    // while(!Serial.available()) delay(100); — sem prazo. Aqui, até a porta fechar.
    const l = this.ligacao;
    let primeiro: number | null = null;
    while (primeiro === null && l && l.aberta) {
      primeiro = await this.lerChar(Date.now() + 60_000);
    }
    if (primeiro === null) return;
    // Serial.readStringUntil('\n') (com o timeout do Stream) e trim().
    let texto = primeiro === LF ? '' : String.fromCharCode(primeiro);
    if (primeiro !== LF) {
      const ate = Date.now() + this.tempos.esperaDoReadStringMs;
      for (;;) {
        const c = await this.lerChar(ate);
        if (c === null || c === LF) break;
        texto += String.fromCharCode(c);
      }
    }
    texto = texto.trim();
    if (texto.length === 0) {
      this.println('ERRO: Nenhum dado recebido.');
      this.println('ERRO: Falha ao receber o horario do dispositivo!');
      return;
    }
    // strtoull(…, nullptr, 10), sem validar: "HELLO" vira 0.
    const ts = strtoul(texto, 10, 64).valor;
    this.println(`Timestamp inicial recebido: ${ts}`);
    this.println('Primeiro boot configurado!');
    this.println(`Timestamp inicial: ${ts}`);
    this.arquivo = codificarArquivo0(ts, []);
    this.println('Timestamp inicial salvo com sucesso!');
  }

  /* ---------- a conversa ---------- */

  /** Devolve true se a placa travou (não segue para a medição). */
  private async handleWakeupGPIO(): Promise<boolean> {
    const r = await this.runFileTransferProtocol();
    if (r === 'travou') return true;
    this.println(r ? 'Transferencia de arquivo concluida com sucesso.' : 'ERRO: Falha na transferencia de arquivo.');
    return false;
  }

  private async runFileTransferProtocol(): Promise<boolean | 'travou'> {
    const h = await this.waitForHandshake();
    if (h !== true) return h;
    if (!(await this.waitForFileRequest())) return false;
    const t = await this.transmitMeasurementFile();
    if (t === 'travou') return t;
    if (!t) return false;
    const c = await this.waitForTransferConfirmation(t.tamanho, t.crc);
    if (c !== true) return c;
    const ts = await this.receiveNextTimestamp();
    if (ts === 'travou') return ts;
    if (ts === null) return false;
    if (!this.replaceMeasurementFileWithTimestamp(ts)) return false;
    if (this.falhas.travaEm === 'session-complete') { await this.travar(); return 'travou'; }
    this.println('SESSION_COMPLETE');
    return true;
  }

  private async waitForHandshake(): Promise<boolean | 'travou'> {
    this.println('Aguardando handshake USB...');
    const ate = Date.now() + this.tempos.esperaDoHandshakeMs;
    let message = '';
    for (;;) {
      const c = await this.lerChar(ate);
      if (c === null) break;
      if (c === LF) {
        if (message.trim() === 'HELLO') {
          if (this.falhas.travaEm === 'ready') { await this.travar(); return 'travou'; }
          this.println(this.falhas.mac ? `READY:${this.falhas.mac}` : 'READY');
          this.println('Handshake estabelecido!');
          return true;
        }
        message = '';
      } else {
        message += String.fromCharCode(c);
      }
    }
    this.println('Timeout aguardando handshake.');
    return false;
  }

  /** readProtocolLine: { ok, linha }. */
  private async readProtocolLine(timeoutMs: number): Promise<{ ok: boolean; linha: string }> {
    let line = '';
    const ate = Date.now() + timeoutMs;
    for (;;) {
      const c = await this.lerChar(ate);
      if (c === null) return { ok: false, linha: '' };
      if (c === LF) {
        line = line.trim();
        return { ok: line.length > 0, linha: line };
      }
      if (c !== CR) {
        if (line.length >= PROTOCOL_MAX_LINE_LENGTH) {
          this.println('ERROR:BAD_COMMAND');
          return { ok: false, linha: '' };
        }
        line += String.fromCharCode(c);
      }
    }
  }

  private async waitForFileRequest(): Promise<boolean> {
    const r = await this.readProtocolLine(this.tempos.esperaDeLinhaMs);
    if (!r.ok) return false;
    if (r.linha === 'GET_FILE') return true;
    this.println('ERROR:BAD_COMMAND');
    return false;
  }

  private async transmitMeasurementFile(): Promise<{ tamanho: number; crc: number } | false | 'travou'> {
    const e = this.falhas.erroNoArquivo;
    if (!this.arquivo || e === 'NO_FILE') { this.println('ERROR:NO_FILE'); return false; }
    if (e === 'FILE_OPEN_FAILED') { this.println('ERROR:FILE_OPEN_FAILED'); return false; }
    const arquivo = this.arquivo;
    const tamanho = arquivo.length;
    const crc = crc32(arquivo);
    if (e === 'FILE_SEEK_FAILED') { this.println('ERROR:FILE_SEEK_FAILED'); return false; }
    if (this.falhas.travaEm === 'file-info') { await this.travar(); return 'travou'; }

    const extra = this.falhas.intervaloNoFileInfo ? `:${this.falhas.intervaloNoFileInfo}` : '';
    this.print(`FILE_INFO:${tamanho}:${crcEmHex(crc)}${extra}\n`);

    const enviado = arquivo.slice();
    if (this.falhas.crcErrado && enviado.length > 0) enviado[enviado.length - 1] ^= 0x01;
    let totalSent = 0;
    while (totalSent < tamanho) {
      const n = Math.min(TRANSFER_BUFFER_SIZE, tamanho - totalSent);
      let bloco = enviado.subarray(totalSent, totalSent + n);
      const fracao = this.falhas.caboPuxadoNaFracao;
      const corte = this.falhas.caboPuxadoAposBytes
        ?? (fracao === undefined ? undefined : Math.floor(tamanho * fracao));
      if (corte !== undefined && totalSent + n > corte) {
        bloco = bloco.subarray(0, Math.max(0, corte - totalSent));
        this.escreverBytes(bloco);
        totalSent += bloco.length;
        if (this.ligacao) this.desligarPorta(this.ligacao);
        return false; // Serial.write devolve 0 com o cabo fora
      }
      const escritos = this.escreverBytes(bloco);
      if (escritos === 0) return false;
      totalSent += escritos;
    }
    return { tamanho: totalSent, crc };
  }

  private async waitForTransferConfirmation(tamanho: number, crc: number): Promise<boolean | 'travou'> {
    const r = await this.readProtocolLine(this.tempos.esperaDeLinhaMs);
    if (!r.ok) return false;
    const confirmation = r.linha;
    if (confirmation === 'ERROR:CHECKSUM_MISMATCH') return false;
    if (!confirmation.startsWith('RECEIVED:')) { this.println('ERROR:BAD_CONFIRMATION'); return false; }
    const payload = confirmation.substring(9);
    const separator = payload.indexOf(':');
    if (separator < 0) { this.println('ERROR:BAD_CONFIRMATION'); return false; }
    const sizeString = payload.substring(0, separator);
    const crcString = payload.substring(separator + 1);
    if (sizeString.length === 0 || crcString.length === 0) { this.println('ERROR:BAD_CONFIRMATION'); return false; }
    const s = strtoul(sizeString, 10);
    if (!s.consumiuTudo || s.valor !== tamanho) { this.println('ERROR:SIZE_MISMATCH'); return false; }
    const c = strtoul(crcString, 16);
    if (!c.consumiuTudo || c.valor !== crc) { this.println('ERROR:BAD_CONFIRMATION'); return false; }
    if (this.falhas.travaEm === 'transfer-ok') { await this.travar(); return 'travou'; }
    this.println('TRANSFER_OK');
    return true;
  }

  private async receiveNextTimestamp(): Promise<number | null | 'travou'> {
    if (this.falhas.travaEm === 'request-timestamp') { await this.travar(); return 'travou'; }
    this.println('REQUEST_TIMESTAMP');
    const r = await this.readProtocolLine(this.tempos.esperaDeLinhaMs);
    if (!r.ok) { this.println('ERROR:TIMESTAMP_TIMEOUT'); return null; }
    if (r.linha.length === 0) { this.println('ERROR:TIMESTAMP_EMPTY'); return null; }
    if (!/^[0-9]+$/.test(r.linha)) { this.println('ERROR:INVALID_TIMESTAMP'); return null; }
    const ts = strtoul(r.linha, 10, 64);
    if (!ts.consumiuTudo) { this.println('ERROR:INVALID_TIMESTAMP'); return null; }
    this.println(`Timestamp recebido: ${ts.valor}`);
    return ts.valor;
  }

  /** A troca do arquivo, com cada ERROR:* no ponto em que o código o emite. */
  private replaceMeasurementFileWithTimestamp(ts: number): boolean {
    const e = this.falhas.erroNaTroca;
    const antes: ErroDaTroca[] = [
      'REMOVE_TEMP_FAILED', 'TEMP_OPEN_FAILED', 'TEMP_WRITE_FAILED', 'TEMP_VERIFY_OPEN_FAILED',
      'TEMP_VERIFY_FAILED', 'REMOVE_BACKUP_FAILED', 'OLD_FILE_RENAME_FAILED',
    ];
    if (e && antes.includes(e)) { this.println(`ERROR:${e}`); return false; }
    if (e === 'NEW_FILE_RENAME_FAILED') {
      // O backup volta para o lugar: o arquivo antigo continua.
      this.println('ERROR:NEW_FILE_RENAME_FAILED');
      return false;
    }
    if (e === 'FILE_RESTORE_FAILED') {
      // O antigo foi para o backup e não voltou: a placa fica sem arquivo.
      this.arquivo = null;
      this.println('ERROR:FILE_RESTORE_FAILED');
      return false;
    }
    this.arquivo = codificarArquivo0(ts, []);
    if (e === 'BACKUP_CLEANUP_FAILED') {
      this.println('ERROR:BACKUP_CLEANUP_FAILED');
      return false;
    }
    this.println('Novo arquivo de medicoes criado com sucesso!');
    return true;
  }
}

/* ---------- A placa simulada da demonstração (FR-033) ---------- */

let placaDaDemonstracao: PlacaSimulada | null = null;

/**
 * Uma placa só, na memória da página, com os tempos de verdade: o arquivo
 * começa com 3 dias de medições a cada 2 h, como uma placa de produção, e a
 * cada coleta completa ela recomeça com a hora enviada — como a de verdade.
 */
export function placaDeDemonstracao(agoraMs = Date.now()): PlacaSimulada {
  if (!placaDaDemonstracao) {
    const agoraS = Math.floor(agoraMs / 1000);
    placaDaDemonstracao = new PlacaSimulada({
      arquivo: arquivoDaPlaca(agoraS - 36 * 7200 - 1800, 37, 3), tempos: TEMPOS_DA_DEMONSTRACAO, semente: 3,
    });
  }
  return placaDaDemonstracao;
}

/**
 * Os prazos de verdade (30 s pelo HELLO e por linha), sem as esperas de
 * medição (10 s do sensor de gás, 3 s antes de dormir): na demonstração a
 * pessoa pode coletar de novo logo, e a tela espera o ciclo anterior acabar.
 */
const TEMPOS_DA_DEMONSTRACAO: TemposDaPlaca = {
  ...TEMPOS_DA_PLACA, esperaDoSensorMs: 0, esperaAntesDeDormirMs: 0,
};

/** Uma placa recém-programada (primeiro boot), para "Configurar placa nova" na demonstração. */
export function placaNovaDeDemonstracao(): PlacaSimulada {
  return new PlacaSimulada({ arquivo: null, tempos: TEMPOS_DA_DEMONSTRACAO, semente: 5 });
}
