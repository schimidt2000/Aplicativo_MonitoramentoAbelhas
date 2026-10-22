/**
 * CRC-32/ISO-HDLC (o "CRC-32" do zlib, do PNG e do Ethernet): polinômio
 * refletido 0xEDB88320, início 0xFFFFFFFF, XOR final 0xFFFFFFFF. É o que a
 * placa calcula em `calculatedFileCrc32` (teste_de_firmware.ino, commit
 * e93f8ad) e anuncia em `FILE_INFO`, sobre o arquivo inteiro.
 *
 * Puro e incremental: o cabo entrega o arquivo em pedaços, e o CRC pode ser
 * acumulado pedaço a pedaço (`crc32Atualizar`) sem guardar nada além de um
 * número. Tabela de 256 entradas, montada uma vez.
 */

const TABELA: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Estado antes do primeiro byte. */
export const CRC32_INICIAL = 0xffffffff;

/** Acrescenta `bytes` ao estado. Devolve o estado novo (ainda sem o XOR final). */
export function crc32Atualizar(estado: number, bytes: Uint8Array): number {
  let c = estado >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

/** O CRC de um estado acumulado. */
export function crc32Finalizar(estado: number): number {
  return (estado ^ 0xffffffff) >>> 0;
}

/** CRC-32 de um bloco inteiro. */
export function crc32(bytes: Uint8Array): number {
  return crc32Finalizar(crc32Atualizar(CRC32_INICIAL, bytes));
}

/** Como a placa escreve: 8 dígitos hexadecimais maiúsculos (`%08lX`). */
export function crcEmHex(crc: number): string {
  return (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
