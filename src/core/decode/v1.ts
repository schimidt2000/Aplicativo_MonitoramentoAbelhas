/**
 * Formato provisório v1 — NOSSO, não da equipe de hardware. Existe para o
 * transporte simulado funcionar enquanto o formato real não é informado.
 * Ver docs/integracao-firmware.md.
 *
 * Registro de 24 bytes, little-endian. Sentinela para inválido, NUNCA zero:
 * um `0` chega à análise das especialistas parecendo medição real.
 */
import type { Reading } from '../ports/transport';
import { QuadroInvalidoError } from './index';

export const RECORD_SIZE_V1 = 24;
export const FRAME_HEADER_SIZE = 4;

const INVALID_I16 = 0x8000;
const INVALID_U16 = 0xffff;
const INVALID_U8 = 0xff;

const u16 = (v: number) => (v === INVALID_U16 ? null : v);
const u8 = (v: number) => (v === INVALID_U8 ? null : v);
const i16 = (raw: number) => (raw === INVALID_I16 ? null : (raw << 16) >> 16);

/**
 * Quadro: [0]=tipo 0x10 · [1]=proto_ver · [2..3]=índice do lote · [4..]=N × 24 bytes
 * Nunca assumimos quantos registros vêm: derivamos do tamanho e exigimos resto zero.
 */
export function decodeV1(buf: Uint8Array): Reading[] {
  if (buf.length < FRAME_HEADER_SIZE) {
    throw new QuadroInvalidoError('Quadro menor que o cabeçalho mínimo.');
  }
  const payloadLen = buf.length - FRAME_HEADER_SIZE;
  if (payloadLen % RECORD_SIZE_V1 !== 0) {
    throw new QuadroInvalidoError(
      `Quadro com ${payloadLen} bytes de dados não é múltiplo de ${RECORD_SIZE_V1}.`,
    );
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = payloadLen / RECORD_SIZE_V1;
  const out: Reading[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const o = FRAME_HEADER_SIZE + i * RECORD_SIZE_V1;
    out[i] = {
      seq: view.getUint32(o, true),
      tNode: view.getUint32(o + 4, true),
      tempC100: i16(view.getUint16(o + 8, true)),
      rhX100: u16(view.getUint16(o + 10, true)),
      tvocPpb: u16(view.getUint16(o + 12, true)),
      eco2Ppm: u16(view.getUint16(o + 14, true)),
      aqiUba: u8(view.getUint8(o + 16)),
      gasStatus: u8(view.getUint8(o + 17)),
      battMv: u16(view.getUint16(o + 18, true)),
      flags: view.getUint8(o + 20),
    };
  }
  return out;
}

/** Usado pelo transporte simulado e pelos testes. */
export function encodeV1(readings: Reading[], chunkIdx = 0): Uint8Array {
  const buf = new Uint8Array(FRAME_HEADER_SIZE + readings.length * RECORD_SIZE_V1);
  const view = new DataView(buf.buffer);
  buf[0] = 0x10;
  buf[1] = 1;
  view.setUint16(2, chunkIdx, true);

  readings.forEach((r, i) => {
    const o = FRAME_HEADER_SIZE + i * RECORD_SIZE_V1;
    view.setUint32(o, r.seq, true);
    view.setUint32(o + 4, r.tNode, true);
    view.setUint16(o + 8, r.tempC100 === null ? INVALID_I16 : r.tempC100 & 0xffff, true);
    view.setUint16(o + 10, r.rhX100 ?? INVALID_U16, true);
    view.setUint16(o + 12, r.tvocPpb ?? INVALID_U16, true);
    view.setUint16(o + 14, r.eco2Ppm ?? INVALID_U16, true);
    view.setUint8(o + 16, r.aqiUba ?? INVALID_U8);
    view.setUint8(o + 17, r.gasStatus ?? INVALID_U8);
    view.setUint16(o + 18, r.battMv ?? INVALID_U16, true);
    view.setUint8(o + 20, r.flags);
  });
  return buf;
}
