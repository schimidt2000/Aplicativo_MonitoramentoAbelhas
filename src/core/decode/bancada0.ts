/**
 * Formato `bancada-0`: o texto que o código de BANCADA do grupo do firmware
 * imprime no Serial a cada segundo (recebido em 2026-10-14, NÃO confirmado
 * como contrato — ver docs/integracao-firmware.md):
 *
 *   T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm
 *   T=27.10C RH=55.03% Status=1 (WARMUP) AQI=1 TVOC=0ppb eCO2=400ppm
 *
 * e linhas de texto livre ("AHT20 OK", "Falha ao iniciar ENS160…").
 *
 * Regras:
 *  - a linha de leitura é casada INTEIRA, na ordem exata e com os nomes
 *    exatos. Campo trocado de lugar ou renomeado é formato novo, não variação
 *    a tolerar — vira 'ilegivel', nunca leitura com campo adivinhado;
 *  - números viram centésimos por aritmética de texto, sem passar por float:
 *    "34.52" é 3452, e não 3451,9999…;
 *  - `nan`/`inf`/`ovf` (o que o Arduino imprime para float inválido) vira
 *    NULL com motivo. Nunca zero;
 *  - nada aqui lança. Linha que não é leitura vira texto ou ilegível.
 */
import {
  TAMANHO_MAXIMO_DE_LINHA, type EstadoGas, type LinhaInterpretada,
} from './linhas';

/** Decimal com até 2 casas, ou o que o Arduino imprime quando o float não é número. */
const NUM = String.raw`(-?\d{1,5}(?:\.\d{1,2})?|nan|inf|-inf|ovf)`;
const INTEIRO = String.raw`(\d{1,6})`;

const LEITURA = new RegExp(
  String.raw`^T=${NUM}C RH=${NUM}% Status=(\d{1,3})(?: \(([^()]{0,40})\))?` +
  String.raw` AQI=(\d{1,3}) TVOC=${INTEIRO}ppb eCO2=${INTEIRO}ppm$`,
);

/** Algum campo de leitura aparece, mas a linha não casa: cortada ou formato novo. */
const CAMPO_DE_LEITURA = /(^|\s)(T|RH|Status|AQI|TVOC|eCO2)=/;

/** Controle (fora tab) ou o caractere de substituição do decodificador de texto. */
// eslint-disable-next-line no-control-regex
const ESTRANHO = /[\u0000-\u0008\u000A-\u001F\u007F\uFFFD]/;

/** "34.52" -> 3452; "-3.5" -> -350; "nan" -> null. Exato, sem float. */
export function centesimos(txt: string): number | null {
  const m = /^(-?)(\d{1,5})(?:\.(\d{1,2}))?$/.exec(txt);
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  // "-0.00" é zero, não -0 (que nem é igual a 0 para Object.is).
  return m[1] === '-' && v !== 0 ? -v : v;
}

const ESTADOS: Record<number, EstadoGas> = {
  0: 'normal',
  1: 'aquecendo',
  2: 'primeira-partida',
  3: 'invalido',
};

export function lerLinhaBancada0(bruta: string): LinhaInterpretada {
  // Fim de linha e espaço nas pontas não fazem parte do conteúdo.
  const linha = bruta.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (linha === '') return { tipo: 'vazia' };

  if (linha.length > TAMANHO_MAXIMO_DE_LINHA) {
    return { tipo: 'ilegivel', texto: linha.slice(0, TAMANHO_MAXIMO_DE_LINHA), motivo: 'longa-demais' };
  }
  if (ESTRANHO.test(linha)) {
    return { tipo: 'ilegivel', texto: linha, motivo: 'caracteres-estranhos' };
  }

  const m = LEITURA.exec(linha);
  if (!m) {
    return CAMPO_DE_LEITURA.test(linha)
      ? { tipo: 'ilegivel', texto: linha, motivo: 'fora-do-formato' }
      : { tipo: 'texto', texto: linha };
  }

  const tempC100 = centesimos(m[1]);
  const rhX100 = centesimos(m[2]);
  const gasStatus = Number(m[3]);
  const estadoGas = ESTADOS[gasStatus] ?? 'desconhecido';
  const rotulo = m[4]?.trim();

  return {
    tipo: 'leitura',
    tempC100,
    motivoTemp: tempC100 === null ? 'sem-numero' : null,
    rhX100,
    motivoUmidade: rhX100 === null ? 'sem-numero' : null,
    gasStatus,
    estadoGas,
    aquecendo: estadoGas === 'aquecendo' || estadoGas === 'primeira-partida',
    rotuloStatus: rotulo ? rotulo : null,
    aqiUba: Number(m[5]),
    tvocPpb: Number(m[6]),
    eco2Ppm: Number(m[7]),
  };
}
