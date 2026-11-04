/**
 * Base64 sem depender de `atob`/`btoa`: os bytes do cabo no Android chegam e
 * saem do módulo nativo como texto base64 (feature 006, D-606).
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALOR = new Int16Array(128).fill(-1);
for (let i = 0; i < ALFABETO.length; i++) VALOR[ALFABETO.charCodeAt(i)] = i;

export function paraBase64(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + ALFABETO[n & 63];
  }
  const resto = bytes.length - i;
  if (resto === 1) {
    const n = bytes[i] << 16;
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63] + '==';
  } else if (resto === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += ALFABETO[n >> 18] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + '=';
  }
  return s;
}

/** Ignora quebras de linha e espaços; para no primeiro `=`. */
export function deBase64(texto: string): Uint8Array {
  const saida: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c === 61) break; // '='
    const v = c < 128 ? VALOR[c] : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      saida.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(saida);
}
