/**
 * Leitor `bancada-0` (feature 004). A linha é de outra equipe e vai mudar:
 * estes testes garantem que o que não casa vira texto ou ilegível — nunca
 * leitura com campo adivinhado, nunca exceção (SC-002, SC-003).
 */
import { describe, expect, it } from 'vitest';
import { centesimos, lerLinhaBancada0 } from '@/core/decode/bancada0';
import {
  FORMATO_DE_LINHA_ATUAL, FormatoDeLinhaDesconhecidoError, TAMANHO_MAXIMO_DE_LINHA,
  formatoDeLinhaSuportado, leitorDeLinha, type LinhaInterpretada,
} from '@/core/decode/linhas';

/** As 7 linhas de exemplo que o grupo do firmware mandou (código de 2026-10-14). */
const EXEMPLOS = [
  'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm',
  'T=27.10C RH=55.03% Status=1 (WARMUP) AQI=1 TVOC=0ppb eCO2=400ppm',
  '=== Inicializando AHT20 ===',
  'AHT20 OK',
  'Falha ao iniciar ENS160. Verifique endereco I2C (0x53/0x52) e fiacao.',
  'Erro na leitura do AHT20 (CRC/timeout)',
  'Aguardando estabilizacao do ENS160 (~3 min)...',
];

function leitura(l: LinhaInterpretada) {
  if (l.tipo !== 'leitura') throw new Error(`esperava leitura, veio ${l.tipo}`);
  return l;
}

describe('bancada-0: as linhas de exemplo do grupo do firmware', () => {
  it('classifica 2 leituras e 5 textos', () => {
    const tipos = EXEMPLOS.map((l) => lerLinhaBancada0(l).tipo);
    expect(tipos).toEqual(['leitura', 'leitura', 'texto', 'texto', 'texto', 'texto', 'texto']);
  });

  it('leitura normal: valores brutos em centésimos, exatos', () => {
    expect(lerLinhaBancada0(EXEMPLOS[0])).toEqual({
      tipo: 'leitura',
      tempC100: 3452, motivoTemp: null,
      rhX100: 6120, motivoUmidade: null,
      gasStatus: 0, estadoGas: 'normal', aquecendo: false, rotuloStatus: null,
      aqiUba: 2, tvocPpb: 180, eco2Ppm: 650,
    });
  });

  it('leitura aquecendo: status 1, rótulo informativo, flag de aquecimento', () => {
    const l = leitura(lerLinhaBancada0(EXEMPLOS[1]));
    expect(l.tempC100).toBe(2710);
    expect(l.rhX100).toBe(5503);
    expect(l.gasStatus).toBe(1);
    expect(l.estadoGas).toBe('aquecendo');
    expect(l.aquecendo).toBe(true);
    expect(l.rotuloStatus).toBe('WARMUP');
    // TVOC=0 durante o aquecimento é o que a placa mandou: fica 0, e quem mostra decide.
    expect(l.tvocPpb).toBe(0);
  });

  it('textos chegam inteiros, sem o fim de linha', () => {
    expect(lerLinhaBancada0('AHT20 OK\r')).toEqual({ tipo: 'texto', texto: 'AHT20 OK' });
    expect(lerLinhaBancada0(EXEMPLOS[4])).toEqual({ tipo: 'texto', texto: EXEMPLOS[4] });
  });
});

describe('bancada-0: status do sensor de gás', () => {
  const comStatus = (s: string) =>
    leitura(lerLinhaBancada0(`T=30.00C RH=50.00% Status=${s} AQI=1 TVOC=10ppb eCO2=400ppm`));

  it('0 normal, 1 aquecendo, 2 primeira partida, 3 inválido', () => {
    expect(comStatus('0').estadoGas).toBe('normal');
    expect(comStatus('1').estadoGas).toBe('aquecendo');
    expect(comStatus('2 (INITIAL STARTUP)').estadoGas).toBe('primeira-partida');
    expect(comStatus('3').estadoGas).toBe('invalido');
  });

  it('aquecendo vale para 1 e 2, e só para eles', () => {
    expect(['0', '1', '2', '3', '7'].map((s) => comStatus(s).aquecendo))
      .toEqual([false, true, true, false, false]);
  });

  it('status fora de 0 a 3 é "desconhecido", com o número preservado', () => {
    const l = comStatus('7');
    expect(l.estadoGas).toBe('desconhecido');
    expect(l.gasStatus).toBe(7);
  });
});

describe('bancada-0: números', () => {
  it('temperatura negativa (teste de geladeira)', () => {
    const l = leitura(lerLinhaBancada0('T=-3.25C RH=88.00% Status=0 AQI=1 TVOC=5ppb eCO2=400ppm'));
    expect(l.tempC100).toBe(-325);
  });

  it('centésimos exatos, sem erro de float', () => {
    expect(centesimos('34.52')).toBe(3452);
    expect(centesimos('0.29')).toBe(29);    // 0.29 * 100 = 28.999999999999996 em float
    expect(centesimos('1.1')).toBe(110);
    expect(centesimos('35')).toBe(3500);
    expect(centesimos('-0.5')).toBe(-50);
    expect(centesimos('-0.00')).toBe(0);
    expect(Object.is(centesimos('-0.00'), 0)).toBe(true);
  });

  it('nan / inf / ovf viram NULL com motivo, nunca zero', () => {
    for (const ruim of ['nan', 'inf', '-inf', 'ovf']) {
      const l = leitura(lerLinhaBancada0(`T=${ruim}C RH=${ruim}% Status=0 AQI=1 TVOC=5ppb eCO2=400ppm`));
      expect(l.tempC100).toBeNull();
      expect(l.motivoTemp).toBe('sem-numero');
      expect(l.rhX100).toBeNull();
      expect(l.motivoUmidade).toBe('sem-numero');
      // O gás da mesma linha continua valendo.
      expect(l.tvocPpb).toBe(5);
    }
  });

  it('número com 3 casas não é bancada-0: ilegível, não arredondado', () => {
    const l = lerLinhaBancada0('T=34.521C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm');
    expect(l).toMatchObject({ tipo: 'ilegivel', motivo: 'fora-do-formato' });
  });
});

describe('bancada-0: fim de linha, cortes e lixo', () => {
  it('CRLF, LF e espaço sobrando dão o mesmo resultado', () => {
    const base = lerLinhaBancada0(EXEMPLOS[0]);
    expect(lerLinhaBancada0(`${EXEMPLOS[0]}\r\n`)).toEqual(base);
    expect(lerLinhaBancada0(`${EXEMPLOS[0]}\n`)).toEqual(base);
    expect(lerLinhaBancada0(`  ${EXEMPLOS[0]}  \r`)).toEqual(base);
  });

  it('linha vazia ou só fim de linha é "vazia"', () => {
    for (const v of ['', '\r', '\r\n', '   ', '\t']) {
      expect(lerLinhaBancada0(v)).toEqual({ tipo: 'vazia' });
    }
  });

  it('linha cortada no começo ou no fim é ilegível, nunca leitura parcial', () => {
    const cortes = [
      '2C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm',  // entrou no meio
      'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=65', // saiu no meio
      'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb',
      'T=34.52C RH=61',
      'RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm',
      'eCO2=650ppm',
    ];
    for (const c of cortes) {
      expect(lerLinhaBancada0(c)).toEqual({ tipo: 'ilegivel', texto: c, motivo: 'fora-do-formato' });
    }
  });

  it('campo trocado de lugar ou renomeado é formato novo: ilegível', () => {
    for (const c of [
      'RH=61.20% T=34.52C Status=0 AQI=2 TVOC=180ppb eCO2=650ppm',
      'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb CO2=650ppm',
      'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm BAT=3.9V',
      't=34.52c rh=61.20% status=0 aqi=2 tvoc=180ppb eco2=650ppm',
    ]) {
      expect(lerLinhaBancada0(c).tipo).not.toBe('leitura');
    }
  });

  it('lixo de velocidade errada é ilegível por caracteres estranhos', () => {
    const lixo = '\u0000\u0013x\uFFFD\uFFFD\u0007';
    expect(lerLinhaBancada0(lixo)).toMatchObject({ tipo: 'ilegivel', motivo: 'caracteres-estranhos' });
    // Leitura com um byte trocado no meio também.
    const sujo = 'T=34.52C RH=61.20% Sta\uFFFDus=0 AQI=2 TVOC=180ppb eCO2=650ppm';
    expect(lerLinhaBancada0(sujo)).toMatchObject({ tipo: 'ilegivel', motivo: 'caracteres-estranhos' });
  });

  it('linha gigante é ilegível e devolve no máximo o teto', () => {
    const g = lerLinhaBancada0('x'.repeat(TAMANHO_MAXIMO_DE_LINHA * 4));
    expect(g).toMatchObject({ tipo: 'ilegivel', motivo: 'longa-demais' });
    if (g.tipo === 'ilegivel') expect(g.texto.length).toBe(TAMANHO_MAXIMO_DE_LINHA);
  });

  it('nenhuma linha derruba o leitor', () => {
    const malucas = [
      ...EXEMPLOS, '', '\u0000', 'T=', 'T==C', 'Status=', '(((', ')', '%%%%', 'T=1e9C',
      'T=99999999999999999999C RH=1.00% Status=0 AQI=1 TVOC=1ppb eCO2=400ppm',
      '🐝 abelha', 'Ã§Ã£o', '\\r\\n', 'x'.repeat(10_000),
    ];
    for (const l of malucas) expect(() => lerLinhaBancada0(l)).not.toThrow();
  });
});

describe('tabela formato → leitor', () => {
  it('bancada-0 é o formato atual e está na tabela', () => {
    expect(FORMATO_DE_LINHA_ATUAL).toBe('bancada-0');
    expect(formatoDeLinhaSuportado('bancada-0')).toBe(true);
    expect(leitorDeLinha('bancada-0')).toBe(lerLinhaBancada0);
  });

  it('formato desconhecido é recusado, nunca tentado', () => {
    expect(formatoDeLinhaSuportado('bancada-1')).toBe(false);
    expect(formatoDeLinhaSuportado('toString')).toBe(false);
    expect(() => leitorDeLinha('bancada-1')).toThrow(FormatoDeLinhaDesconhecidoError);
    expect(() => leitorDeLinha('__proto__')).toThrow(FormatoDeLinhaDesconhecidoError);
  });
});
