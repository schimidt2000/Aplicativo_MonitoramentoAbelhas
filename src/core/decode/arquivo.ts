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
 * O arquivo não traz versão: quem escolhe o leitor somos nós
 * (`FORMATO_DE_ARQUIVO_ATUAL`). Quando o grupo de armazenamento acrescentar a
 * identificação da placa, entra um leitor novo aqui e este fica como está.
 */
import type { Reading } from '../ports/transport';

export type FormatoDeArquivo = 'arquivo-0';

/** O formato que a coleta pelo cabo usa enquanto a placa não diz qual manda. */
export const FORMATO_DE_ARQUIVO_ATUAL: FormatoDeArquivo = 'arquivo-0';

/**
 * `reading.proto_ver` de cada formato (D-516). `1` é o formato provisório nosso
 * (v1, transporte simulado); `100` em diante, os arquivos do firmware real.
 */
export const PROTO_VER_DO_FORMATO: Record<FormatoDeArquivo, number> = {
  'arquivo-0': 100,
};

export const CABECALHO_ARQUIVO_0 = 8;
export const REGISTRO_ARQUIVO_0 = 16;

/**
 * A chave (D-501): `seq = início × 1.000.000 + número`. O número da medição
 * zera a cada coleta; o par (início, número) não se repete. Legível, e o maior
 * valor possível (início < 2³²) fica abaixo de 2⁵³: inteiro exato em
 * JavaScript, no SQLite e no Postgres.
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
  | 'curto-demais'              // menos que os 8 bytes da hora de início
  | 'tamanho-nao-multiplo'      // (tamanho − 8) não é múltiplo de 16
  | 'inicio-fora-de-faixa'      // hora de início ≥ 2³² (não cabe na chave)
  | 'medicoes-demais'           // mais de 999.999 medições
  | 'numeracao-fora-de-ordem';  // a medição k não tem o número k

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
  /** Hora de início do arquivo, segundos Unix, como a placa gravou. */
  inicioS: number;
  medicoes: MedicaoBruta[];
  /** As mesmas medições no tipo canônico, com a chave já derivada. */
  leituras: Reading[];
}

type Leitor = (bytes: Uint8Array) => ArquivoLido;

const LEITORES: Record<FormatoDeArquivo, Leitor> = {
  'arquivo-0': lerArquivo0,
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

function lerArquivo0(bytes: Uint8Array): ArquivoLido {
  const formato: FormatoDeArquivo = 'arquivo-0';
  if (bytes.length < CABECALHO_ARQUIVO_0) throw new ArquivoInvalidoError(formato, 'curto-demais');
  const corpo = bytes.length - CABECALHO_ARQUIVO_0;
  // Nunca assumir quantos registros vêm: derivar do tamanho e exigir resto zero.
  if (corpo % REGISTRO_ARQUIVO_0 !== 0) throw new ArquivoInvalidoError(formato, 'tamanho-nao-multiplo');

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // uint64 em duas metades: sem BigInt, e a metade alta precisa ser zero.
  const inicioS = v.getUint32(0, true);
  if (v.getUint32(4, true) !== 0) throw new ArquivoInvalidoError(formato, 'inicio-fora-de-faixa');

  const n = corpo / REGISTRO_ARQUIVO_0;
  if (n > MAXIMO_DE_MEDICOES) throw new ArquivoInvalidoError(formato, 'medicoes-demais');

  const protoVer = PROTO_VER_DO_FORMATO[formato];
  const medicoes: MedicaoBruta[] = new Array(n);
  const leituras: Reading[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const o = CABECALHO_ARQUIVO_0 + k * REGISTRO_ARQUIVO_0;
    const m: MedicaoBruta = {
      temperatura: v.getFloat32(o, true),
      umidade: v.getFloat32(o + 4, true),
      eco2: v.getUint16(o + 8, true),
      tvoc: v.getUint16(o + 10, true),
      id: v.getUint32(o + 12, true),
    };
    // A numeração é o que pega um formato mudado cujo tamanho fecha por acaso.
    if (m.id !== k) throw new ArquivoInvalidoError(formato, 'numeracao-fora-de-ordem');
    medicoes[k] = m;

    const temp = centesimos(m.temperatura);
    const rh = centesimos(m.umidade);
    leituras[k] = {
      seq: seqDaMedicao(inicioS, m.id),
      tNode: m.id,
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
  return { formato, protoVer, inicioS, medicoes, leituras };
}

/**
 * O inverso, para a placa simulada e os testes. `id` omitido vale a posição.
 * Escreve exatamente o que o firmware escreveria (float32, LE, sem enchimento).
 */
export function codificarArquivo0(
  inicioS: number,
  medicoes: Array<Omit<MedicaoBruta, 'id'> & { id?: number }>,
): Uint8Array {
  const buf = new Uint8Array(CABECALHO_ARQUIVO_0 + medicoes.length * REGISTRO_ARQUIVO_0);
  const v = new DataView(buf.buffer);
  v.setUint32(0, inicioS >>> 0, true);
  v.setUint32(4, Math.floor(inicioS / 2 ** 32) >>> 0, true);
  medicoes.forEach((m, k) => {
    const o = CABECALHO_ARQUIVO_0 + k * REGISTRO_ARQUIVO_0;
    v.setFloat32(o, m.temperatura, true);
    v.setFloat32(o + 4, m.umidade, true);
    v.setUint16(o + 8, m.eco2, true);
    v.setUint16(o + 10, m.tvoc, true);
    v.setUint32(o + 12, m.id ?? k, true);
  });
  return buf;
}
