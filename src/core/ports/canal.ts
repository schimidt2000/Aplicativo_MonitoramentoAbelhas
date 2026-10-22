/**
 * Porta de canal de bytes para a coleta pelo cabo (feature 005, D-503).
 *
 * O protocolo do firmware não cabe em `Transport`/`NodeSession` (001): a placa
 * manda o arquivo inteiro, o app só pode confirmar DEPOIS de gravar de forma
 * durável, e só depois disso manda a hora — que apaga o arquivo da placa. A
 * conversa é uma máquina de estados pura (`core/cabo/protocolo.ts`) que fala
 * com esta porta; quem a implementa é `src/transports/` (Web Serial e a placa
 * simulada). Domínio e tela nunca veem a porta serial do navegador.
 *
 * Contrato de erro (o mesmo de `core/ports/transport.ts`): toda falha é
 * `TransportError` com código — `timeout` quando o prazo passa sem o que se
 * esperava, `connection-lost` quando a porta some (cabo, placa que dormiu).
 */
import { TransportError, type TransportErrorCode } from './transport';

export interface CanalSerial {
  /** Manda o texto (ASCII), já com o fim de linha. */
  escrever(texto: string): Promise<void>;
  /**
   * A próxima linha completa, sem o LF e sem o CR do fim. Só LF encerra linha:
   * um CR sozinho nunca, porque depois do `FILE_INFO` o próximo byte é binário.
   */
  lerLinha(prazoMs: number): Promise<string>;
  /**
   * Exatamente `n` bytes, começando no byte seguinte ao LF da última linha lida
   * — inclusive os que chegaram no mesmo pedaço da linha. O prazo é de
   * SILÊNCIO: conta desde o último byte que chegou.
   * Falha com `LeituraIncompletaError`, que traz o que chegou.
   */
  lerBytes(n: number, silencioMaximoMs: number, aoProgredir?: (recebidos: number) => void): Promise<Uint8Array>;
  /** Solta a porta. Nunca lança. */
  fechar(): Promise<void>;
}

/** A leitura de N bytes acabou antes do fim. `parcial` é o que chegou (FR-007). */
export class LeituraIncompletaError extends TransportError {
  constructor(code: TransportErrorCode, readonly parcial: Uint8Array, detail?: string) {
    super(code, detail);
    this.name = 'LeituraIncompletaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
