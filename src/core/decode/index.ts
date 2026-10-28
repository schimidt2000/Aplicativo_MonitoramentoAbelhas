/**
 * Decodificador versionado. Quando a outra equipe definir o formato real, o
 * trabalho é escrever decodeV2 e acrescentar uma linha na tabela — nada mais
 * no app muda (Princípio IV).
 */
import type { Reading } from '../ports/transport';
import { RECORD_SIZE_V1, decodeV1 } from './v1';

export type Decoder = (buf: Uint8Array) => Reading[];

export class VersaoDesconhecidaError extends Error {
  constructor(readonly protoVer: number) {
    super(`Formato de dados versão ${protoVer} não reconhecido.`);
    this.name = 'VersaoDesconhecidaError';
    // Mantém `instanceof` mesmo quando a classe é compilada para ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { QuadroInvalidoError } from './erros';

const DECODERS: Record<number, Decoder> = {
  1: decodeV1,
};

export function protocoloSuportado(protoVer: number): boolean {
  return protoVer in DECODERS;
}

/** Lança VersaoDesconhecidaError. Nunca decodifica "na tentativa". */
export function decode(protoVer: number, buf: Uint8Array): Reading[] {
  const d = DECODERS[protoVer];
  if (!d) throw new VersaoDesconhecidaError(protoVer);
  return d(buf);
}

export { RECORD_SIZE_V1, decodeV1 };
