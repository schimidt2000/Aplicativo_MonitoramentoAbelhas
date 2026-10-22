/**
 * O leitor de bytes do cabo, com modo LINHA e modo "N BYTES EXATOS" sobre o
 * mesmo fluxo (feature 005, D-505). Sem API de navegador: a Web Serial
 * (`./coleta.ts`) e a placa simulada (`../mock/firmware.ts`) empurram pedaços
 * aqui, e a conversa lê daqui pela porta `CanalSerial`.
 *
 * Por que não o `JuntadorDeLinhas` da 004: ele recebe TEXTO já decodificado. O
 * `FILE_INFO` e o começo do arquivo binário chegam, muitas vezes, no mesmo
 * pedaço; decodificar o pedaço inteiro como texto estragaria o binário. Aqui
 * se guardam BYTES: `lerLinha` consome até o primeiro LF e decodifica só
 * aquela linha; `lerBytes(n)` consome exatamente `n` bytes, começando pelos
 * que sobraram do pedaço da linha. Nenhum byte se perde nem é lido duas vezes
 * entre os dois modos.
 *
 * Fim de linha: só LF (0x0A), com um CR final retirado. Um CR sozinho nunca
 * encerra linha — o `FILE_INFO` sai com "\n" e o byte seguinte já é binário.
 * Linha acima de TAMANHO_MAXIMO_DE_LINHA é descartada até o próximo LF.
 */
import { LeituraIncompletaError, type CanalSerial } from '@/core/ports/canal';
import { TransportError } from '@/core/ports/transport';
import { TAMANHO_MAXIMO_DE_LINHA } from '@/core/decode/linhas';

const LF = 0x0a;
const CR = 0x0d;

export class EntradaDeBytes {
  private pedacos: Uint8Array[] = [];
  /** Quantos bytes do primeiro pedaço já foram consumidos. */
  private inicio = 0;
  private guardados = 0;
  private descartandoLinha = false;
  private fim: TransportError | null = null;
  private acordar: (() => void) | null = null;
  private readonly decodificador = new TextDecoder('utf-8');

  constructor(private readonly agora: () => number = Date.now) {}

  /** Um pedaço chegou da porta. Copiado: a porta pode reaproveitar o buffer. */
  empurrar(pedaco: Uint8Array): void {
    if (this.fim || pedaco.length === 0) return;
    this.pedacos.push(pedaco.slice());
    this.guardados += pedaco.length;
    this.despertar();
  }

  /** A porta acabou. O que já chegou ainda pode ser lido; depois, `erro`. */
  encerrar(erro: TransportError): void {
    if (!this.fim) this.fim = erro;
    this.despertar();
  }

  get encerrada(): boolean { return this.fim !== null; }

  /** Bytes que chegaram e ninguém leu ainda. Só para teste. */
  get pendentes(): number { return this.guardados; }

  async lerLinha(prazoMs: number): Promise<string> {
    const limite = this.agora() + prazoMs;
    for (;;) {
      const linha = this.tirarLinha();
      if (linha !== null) return linha;
      if (this.fim) throw this.fim;
      const resta = limite - this.agora();
      if (resta <= 0) throw new TransportError('timeout', 'ler linha');
      await this.esperar(resta);
    }
  }

  async lerBytes(n: number, silencioMaximoMs: number, aoProgredir?: (recebidos: number) => void): Promise<Uint8Array> {
    const saida = new Uint8Array(n);
    let k = 0;
    let ultimoByte = this.agora();
    while (k < n) {
      const pedaco = this.tirarAte(n - k);
      if (pedaco) {
        saida.set(pedaco, k);
        k += pedaco.length;
        ultimoByte = this.agora();
        try { aoProgredir?.(k); } catch { /* a tela não para a leitura */ }
        continue;
      }
      if (this.fim) throw new LeituraIncompletaError(this.fim.code, saida.slice(0, k), 'arquivo interrompido');
      const resta = ultimoByte + silencioMaximoMs - this.agora();
      if (resta <= 0) throw new LeituraIncompletaError('timeout', saida.slice(0, k), 'silêncio no arquivo');
      await this.esperar(resta);
    }
    return saida;
  }

  /* ---------- por dentro ---------- */

  private despertar() {
    const a = this.acordar;
    this.acordar = null;
    a?.();
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(() => { this.acordar = null; resolve(); }, ms);
      this.acordar = () => { clearTimeout(id); resolve(); };
    });
  }

  /** Consome até `max` bytes do começo, ou null se não há nada. */
  private tirarAte(max: number): Uint8Array | null {
    if (this.guardados === 0) return null;
    const p = this.pedacos[0];
    const disponivel = p.length - this.inicio;
    const n = Math.min(max, disponivel);
    const parte = p.subarray(this.inicio, this.inicio + n);
    this.consumir(n);
    return parte;
  }

  private consumir(n: number) {
    this.inicio += n;
    this.guardados -= n;
    while (this.pedacos.length > 0 && this.inicio >= this.pedacos[0].length) {
      this.inicio -= this.pedacos[0].length;
      this.pedacos.shift();
    }
  }

  /** Uma linha completa, sem LF e sem o CR final; ou null. */
  private tirarLinha(): string | null {
    for (;;) {
      // Procura o LF sem copiar.
      let pos = -1;
      let visto = 0;
      for (let i = 0; i < this.pedacos.length && pos === -1; i++) {
        const p = this.pedacos[i];
        const de = i === 0 ? this.inicio : 0;
        const j = p.indexOf(LF, de);
        if (j !== -1) pos = visto + (j - de);
        else visto += p.length - de;
      }
      if (pos === -1) {
        // Sem fim de linha e acima do teto: não é linha de protocolo. Joga fora.
        if (this.guardados > TAMANHO_MAXIMO_DE_LINHA) {
          this.consumir(this.guardados);
          this.descartandoLinha = true;
        }
        return null;
      }
      const bytes = new Uint8Array(pos);
      let k = 0;
      while (k < pos) {
        const parte = this.tirarAte(pos - k) as Uint8Array;
        bytes.set(parte, k);
        k += parte.length;
      }
      this.consumir(1); // o LF
      if (this.descartandoLinha) {
        this.descartandoLinha = false;
        continue;
      }
      if (bytes.length > TAMANHO_MAXIMO_DE_LINHA) continue;
      const fimUtil = bytes.length > 0 && bytes[bytes.length - 1] === CR ? bytes.length - 1 : bytes.length;
      return this.decodificador.decode(bytes.subarray(0, fimUtil));
    }
  }
}

const codificador = new TextEncoder();

/**
 * Uma `CanalSerial` sobre uma `EntradaDeBytes`. `escreverBytes` e `soltar`
 * vêm de quem tem a porta (a Web Serial ou a placa simulada).
 */
export function canalSobre(
  entrada: EntradaDeBytes,
  escreverBytes: (b: Uint8Array) => Promise<void>,
  soltar: () => Promise<void>,
): CanalSerial {
  return {
    async escrever(texto) {
      try {
        await escreverBytes(codificador.encode(texto));
      } catch (e) {
        throw e instanceof TransportError ? e : new TransportError('connection-lost', 'escrever');
      }
    },
    lerLinha: (prazoMs) => entrada.lerLinha(prazoMs),
    lerBytes: (n, silencio, aoProgredir) => entrada.lerBytes(n, silencio, aoProgredir),
    async fechar() {
      try { await soltar(); } catch { /* fechar nunca vira problema */ }
    },
  };
}
