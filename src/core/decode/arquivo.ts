/**
 * Leitores do ARQUIVO que a placa entrega pelo cabo, versionados (feature
 * 005). É a terceira tabela `formato → leitor` do app, ao lado da binária da
 * 001 (`./index.ts`) e da de linhas da 004 (`./linhas.ts`). Mesma regra
 * (Princípio IV): formato desconhecido é recusado, nunca "tentado"; o arquivo
 * que não fecha é recusado INTEIRO, sem nada parcial.
 *
 * `arquivo-0`: o `/measurements.bin` do teste_de_firmware.ino, commit e93f8ad
 * (2026-10-21). Contrato em specs/005-coleta-pelo-cabo/contracts/arquivo-0.md.
 *
 *   [0..7]   uint64 LE   hora de início do arquivo, segundos Unix
 *   [8+16k]  float32 LE  temperatura (°C)
 *            float32 LE  umidade (%UR)
 *            uint16 LE   eCO₂ (ppm) — DERIVADO de voláteis, NÃO é CO₂
 *            uint16 LE   TVOC (ppb)
 *            uint32 LE   número da medição (0, 1, 2…)
 *
 * `arquivo-1`: o mesmo arquivo do commit 4cc7ed8 (2026-10-28), com a
 * identificação da placa na frente. Contrato em contracts/arquivo-1.md.
 *
 *   [0..16]  17 caracteres ASCII, o MAC: "AA:BB:CC:11:22:33"
 *   [17]     0x00, o fim do texto
 *   [18..25] uint64 LE   hora de início do arquivo, segundos Unix
 *   [26+16k] a mesma medição de 16 bytes
 *
 * O arquivo não traz versão: quem escolhe o leitor somos nós
 * (`FORMATO_DE_ARQUIVO_ATUAL`). Os dois leitores ficam na tabela: o bruto de
 * cada sessão guarda o arquivo como veio, e pode ser relido pelo leitor certo.
 *
 * A chave e a hora saem da POSIÇÃO da medição no arquivo (D-520): a placa
 * grava uma medição por despertar, em ordem, e é a posição que a conta
 * `início + k × intervalo` pede. O número que a placa escreve só confirma que
 * o arquivo está inteiro e na ordem.
 */
import type { Reading } from '../ports/transport';

export type FormatoDeArquivo = 'arquivo-0' | 'arquivo-1';

/**
 * O formato que a coleta pelo cabo usa enquanto a placa não diz qual manda: o
 * do firmware mais novo (4cc7ed8). Uma placa com o firmware antigo é recusada
 * sem gravar nada, e o arquivo dela continua na placa.
 */
export const FORMATO_DE_ARQUIVO_ATUAL: FormatoDeArquivo = 'arquivo-1';

/**
 * `reading.proto_ver` de cada formato (D-516). `1` é o formato provisório nosso
 * (v1, transporte simulado); `100` em diante, os arquivos do firmware real.
 */
export const PROTO_VER_DO_FORMATO: Record<FormatoDeArquivo, number> = {
  'arquivo-0': 100,
  'arquivo-1': 101,
};

export const CABECALHO_ARQUIVO_0 = 8;
/** 18 bytes do MAC (17 caracteres + o 0x00) e 8 da hora de início. */
export const CABECALHO_ARQUIVO_1 = 26;
export const TAMANHO_DO_MAC_NO_ARQUIVO = 18;
/** A medição tem 16 bytes nos dois formatos. */
export const REGISTRO_ARQUIVO_0 = 16;
export const REGISTRO_DE_MEDICAO = REGISTRO_ARQUIVO_0;

export const CABECALHO_DO_FORMATO: Record<FormatoDeArquivo, number> = {
  'arquivo-0': CABECALHO_ARQUIVO_0,
  'arquivo-1': CABECALHO_ARQUIVO_1,
};

/**
 * A chave (D-501, D-520): `seq = início × 1.000.000 + posição`. A numeração
 * recomeça a cada coleta; o par (início, posição) não se repete. Legível, e o
 * maior valor possível (início < 2³²) fica abaixo de 2⁵³: inteiro exato em
 * JavaScript, no SQLite e no Postgres. No `arquivo-0` a posição é o próprio
 * número que a placa grava.
 */
export const MULTIPLICADOR_DO_INICIO = 1_000_000;
export const MAXIMO_DE_MEDICOES = MULTIPLICADOR_DO_INICIO - 1;

export function seqDaMedicao(inicioS: number, id: number): number {
  return inicioS * MULTIPLICADOR_DO_INICIO + id;
}
export function inicioDoSeq(seq: number): number {
  return Math.floor(seq / MULTIPLICADOR_DO_INICIO);
}
export function idDoSeq(seq: number): number {
  return seq - inicioDoSeq(seq) * MULTIPLICADOR_DO_INICIO;
}

/**
 * Por que um valor ficou em branco, em `reading.flags` (só para os formatos
 * do arquivo, `proto_ver >= 100`). Nunca 0, -1 ou -999 no lugar do valor.
 */
export const FLAG_TEMPERATURA_NAO_E_NUMERO = 1;
export const FLAG_UMIDADE_NAO_E_NUMERO = 2;

export type MotivoArquivoInvalido =
  | 'curto-demais'              // menor que o cabeçalho (8 ou 26 bytes)
  | 'tamanho-nao-multiplo'      // (tamanho − cabeçalho) não é múltiplo de 16
  | 'cabecalho-invalido'        // o MAC não é um MAC, ou falta o 0x00 depois dele
  | 'inicio-fora-de-faixa'      // hora de início ≥ 2³² (não cabe na chave)
  | 'medicoes-demais'           // mais de 999.999 medições
  | 'numeracao-fora-de-ordem';  // a numeração não segue a posição (ver cada leitor)

export class ArquivoInvalidoError extends Error {
  constructor(readonly formato: FormatoDeArquivo, readonly motivo: MotivoArquivoInvalido) {
    super(`Arquivo ${formato} recusado: ${motivo}.`);
    this.name = 'ArquivoInvalidoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FormatoDeArquivoDesconhecidoError extends Error {
  constructor(readonly formato: string) {
    super(`Formato de arquivo ${formato} não reconhecido.`);
    this.name = 'FormatoDeArquivoDesconhecidoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Uma medição como está no arquivo, sem nenhuma conversão. */
export interface MedicaoBruta {
  id: number;
  /** float32 como veio; pode ser NaN. */
  temperatura: number;
  umidade: number;
  eco2: number;
  tvoc: number;
}

export interface ArquivoLido {
  formato: FormatoDeArquivo;
  protoVer: number;
  /** O MAC da placa, "AA:BB:CC:11:22:33". null: o formato não traz. */
  mac: string | null;
  /** Hora de início do arquivo, segundos Unix, como a placa gravou. */
  inicioS: number;
  /**
   * O número que a placa deu à primeira medição. 1 é o defeito conhecido do
   * firmware 4cc7ed8 (`getNextMeasurementId` não desconta o MAC). Só registro.
   */
  numeracaoComecaEm: 0 | 1;
  medicoes: MedicaoBruta[];
  /** As mesmas medições no tipo canônico, com a chave já derivada. */
  leituras: Reading[];
}

type Leitor = (bytes: Uint8Array) => ArquivoLido;

const LEITORES: Record<FormatoDeArquivo, Leitor> = {
  'arquivo-0': lerArquivo0,
  'arquivo-1': lerArquivo1,
};

export function formatoDeArquivoSuportado(f: string): f is FormatoDeArquivo {
  return Object.prototype.hasOwnProperty.call(LEITORES, f);
}

/** Lança `FormatoDeArquivoDesconhecidoError` ou `ArquivoInvalidoError`. Nunca lê pela metade. */
export function lerArquivo(formato: string, bytes: Uint8Array): ArquivoLido {
  if (!formatoDeArquivoSuportado(formato)) throw new FormatoDeArquivoDesconhecidoError(formato);
  return LEITORES[formato](bytes);
}

/** Centésimos para os resumos (a exatidão do AHT21 é ±0,3 °C). O bruto fica ao lado. */
function centesimos(v: number): number | null {
  // `+ 0` tira o -0 de Math.round(-0,004 × 100).
  return Number.isFinite(v) ? Math.round(v * 100) + 0 : null;
}

/**
 * As medições de `n` registros a partir de `cabecalho`, com a chave da POSIÇÃO.
 * `primeiroNumero`: o número que a primeira medição tem de ter; cada seguinte,
 * um a mais. É a numeração que pega um formato mudado cujo tamanho fecha por acaso.
 */
function lerMedicoes(
  formato: FormatoDeArquivo, v: DataView, cabecalho: number, n: number, inicioS: number,
  primeiroNumero: number,
): { medicoes: MedicaoBruta[]; leituras: Reading[] } {
  const medicoes: MedicaoBruta[] = new Array(n);
  const leituras: Reading[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const o = cabecalho + k * REGISTRO_DE_MEDICAO;
    const m: MedicaoBruta = {
      temperatura: v.getFloat32(o, true),
      umidade: v.getFloat32(o + 4, true),
      eco2: v.getUint16(o + 8, true),
      tvoc: v.getUint16(o + 10, true),
      id: v.getUint32(o + 12, true),
    };
    if (m.id !== primeiroNumero + k) throw new ArquivoInvalidoError(formato, 'numeracao-fora-de-ordem');
    medicoes[k] = m;

    const temp = centesimos(m.temperatura);
    const rh = centesimos(m.umidade);
    leituras[k] = {
      seq: seqDaMedicao(inicioS, k),
      tNode: k,
      tempC100: temp,
      rhX100: rh,
      tvocPpb: m.tvoc,
      eco2Ppm: m.eco2,
      aqiUba: null,
      gasStatus: null,
      battMv: null,
      flags: (temp === null ? FLAG_TEMPERATURA_NAO_E_NUMERO : 0)
        | (rh === null ? FLAG_UMIDADE_NAO_E_NUMERO : 0),
      ligada: null,
      tempBruto: temp === null ? null : m.temperatura,
      rhBruto: rh === null ? null : m.umidade,
    };
  }
  return { medicoes, leituras };
}

/** Quantas medições cabem depois do cabeçalho: derivado do tamanho, com resto zero. */
function contarMedicoes(formato: FormatoDeArquivo, bytes: Uint8Array): number {
  const cabecalho = CABECALHO_DO_FORMATO[formato];
  if (bytes.length < cabecalho) throw new ArquivoInvalidoError(formato, 'curto-demais');
  const corpo = bytes.length - cabecalho;
  // Nunca assumir quantos registros vêm: derivar do tamanho e exigir resto zero.
  if (corpo % REGISTRO_DE_MEDICAO !== 0) throw new ArquivoInvalidoError(formato, 'tamanho-nao-multiplo');
  const n = corpo / REGISTRO_DE_MEDICAO;
  if (n > MAXIMO_DE_MEDICOES) throw new ArquivoInvalidoError(formato, 'medicoes-demais');
  return n;
}

/** uint64 LE em duas metades: sem BigInt, e a metade alta precisa ser zero. */
function lerInicio(formato: FormatoDeArquivo, v: DataView, o: number): number {
  if (v.getUint32(o + 4, true) !== 0) throw new ArquivoInvalidoError(formato, 'inicio-fora-de-faixa');
  return v.getUint32(o, true);
}

function lerArquivo0(bytes: Uint8Array): ArquivoLido {
  const formato: FormatoDeArquivo = 'arquivo-0';
  const n = contarMedicoes(formato, bytes);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inicioS = lerInicio(formato, v, 0);
  // A placa de e93f8ad numera a partir de 0: a medição k tem o número k.
  const { medicoes, leituras } = lerMedicoes(formato, v, CABECALHO_ARQUIVO_0, n, inicioS, 0);
  return {
    formato, protoVer: PROTO_VER_DO_FORMATO[formato], mac: null, inicioS,
    numeracaoComecaEm: 0, medicoes, leituras,
  };
}

/** "AA:BB:CC:11:22:33" (o firmware escreve com `%02X`; minúscula também passa). */
const MAC_NO_ARQUIVO = /^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/;

function lerArquivo1(bytes: Uint8Array): ArquivoLido {
  const formato: FormatoDeArquivo = 'arquivo-1';
  const n = contarMedicoes(formato, bytes);
  const fim = TAMANHO_DO_MAC_NO_ARQUIVO - 1;
  if (bytes[fim] !== 0) throw new ArquivoInvalidoError(formato, 'cabecalho-invalido');
  let texto = '';
  for (let i = 0; i < fim; i++) texto += String.fromCharCode(bytes[i]);
  if (!MAC_NO_ARQUIVO.test(texto)) throw new ArquivoInvalidoError(formato, 'cabecalho-invalido');
  const mac = texto.toUpperCase();

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inicioS = lerInicio(formato, v, TAMANHO_DO_MAC_NO_ARQUIVO);
  // O 4cc7ed8 numera a partir de 1 (defeito conhecido; o grupo do firmware
  // vai corrigir para 0). Os dois começos valem; qualquer outro, não. A hora
  // não depende disso: sai da posição.
  const lido = n > 0 ? v.getUint32(CABECALHO_ARQUIVO_1 + 12, true) : 0;
  if (lido !== 0 && lido !== 1) throw new ArquivoInvalidoError(formato, 'numeracao-fora-de-ordem');
  const primeiro: 0 | 1 = lido;
  const { medicoes, leituras } = lerMedicoes(formato, v, CABECALHO_ARQUIVO_1, n, inicioS, primeiro);
  return {
    formato, protoVer: PROTO_VER_DO_FORMATO[formato], mac, inicioS,
    numeracaoComecaEm: primeiro, medicoes, leituras,
  };
}

/** Uma medição de 16 bytes, exatamente como o firmware a escreve (float32, LE, sem enchimento). */
export function codificarMedicao(m: Omit<MedicaoBruta, 'id'> & { id: number }): Uint8Array {
  const buf = new Uint8Array(REGISTRO_DE_MEDICAO);
  const v = new DataView(buf.buffer);
  v.setFloat32(0, m.temperatura, true);
  v.setFloat32(4, m.umidade, true);
  v.setUint16(8, m.eco2, true);
  v.setUint16(10, m.tvoc, true);
  v.setUint32(12, m.id, true);
  return buf;
}

function escreverInicio(v: DataView, o: number, inicioS: number) {
  v.setUint32(o, inicioS >>> 0, true);
  v.setUint32(o + 4, Math.floor(inicioS / 2 ** 32) >>> 0, true);
}

/**
 * O inverso, para a placa simulada e os testes. `id` omitido vale a posição.
 * Escreve exatamente o que o firmware escreveria (float32, LE, sem enchimento).
 */
export function codificarArquivo0(
  inicioS: number,
  medicoes: Array<Omit<MedicaoBruta, 'id'> & { id?: number }>,
): Uint8Array {
  const buf = new Uint8Array(CABECALHO_ARQUIVO_0 + medicoes.length * REGISTRO_DE_MEDICAO);
  escreverInicio(new DataView(buf.buffer), 0, inicioS);
  medicoes.forEach((m, k) => buf.set(codificarMedicao({ ...m, id: m.id ?? k }), CABECALHO_ARQUIVO_0 + k * REGISTRO_DE_MEDICAO));
  return buf;
}

/**
 * O `arquivo-1`, para a placa simulada e os testes: o MAC como texto com o
 * 0x00, a hora de início e as medições. `id` omitido vale a posição + 1, como
 * o firmware 4cc7ed8 grava (defeito conhecido); passe `id` para outro começo.
 */
export function codificarArquivo1(
  mac: string,
  inicioS: number,
  medicoes: Array<Omit<MedicaoBruta, 'id'> & { id?: number }>,
): Uint8Array {
  if (mac.length !== TAMANHO_DO_MAC_NO_ARQUIVO - 1) throw new RangeError(`MAC com ${mac.length} caracteres`);
  const buf = new Uint8Array(CABECALHO_ARQUIVO_1 + medicoes.length * REGISTRO_DE_MEDICAO);
  for (let i = 0; i < mac.length; i++) buf[i] = mac.charCodeAt(i);
  buf[TAMANHO_DO_MAC_NO_ARQUIVO - 1] = 0;
  escreverInicio(new DataView(buf.buffer), TAMANHO_DO_MAC_NO_ARQUIVO, inicioS);
  medicoes.forEach((m, k) => buf.set(codificarMedicao({ ...m, id: m.id ?? k + 1 }), CABECALHO_ARQUIVO_1 + k * REGISTRO_DE_MEDICAO));
  return buf;
}
