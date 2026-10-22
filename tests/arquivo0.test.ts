/**
 * Leitor `arquivo-0` (feature 005, FR-012 a FR-014). O arquivo é de outra
 * equipe: lido exatamente como o contrato diz, recusado inteiro quando não
 * fecha, e com os valores brutos preservados.
 */
import { describe, expect, it } from 'vitest';
import {
  ArquivoInvalidoError, FLAG_TEMPERATURA_NAO_E_NUMERO, FLAG_UMIDADE_NAO_E_NUMERO,
  FORMATO_DE_ARQUIVO_ATUAL, FormatoDeArquivoDesconhecidoError, MULTIPLICADOR_DO_INICIO,
  codificarArquivo0, idDoSeq, inicioDoSeq, lerArquivo, seqDaMedicao,
} from '@/core/decode/arquivo';

const hex = (s: string) => Uint8Array.from(s.replace(/\s+/g, '').match(/../g)!.map((b) => parseInt(b, 16)));

/** O exemplo de specs/005-coleta-pelo-cabo/contracts/arquivo-0.md. */
const EXEMPLO = hex(`
  C0 11 D2 6A 00 00 00 00
  33 33 0B 42 00 00 5C 42 90 01 B4 00 00 00 00 00
  CD CC 0B 42 00 00 5E 42 A0 01 B9 00 01 00 00 00
`);

function motivo(fn: () => unknown): string | null {
  try { fn(); return null; } catch (e) {
    return e instanceof ArquivoInvalidoError ? e.motivo : String(e);
  }
}

describe('arquivo-0: o exemplo do contrato, byte a byte', () => {
  const a = lerArquivo('arquivo-0', EXEMPLO);

  it('hora de início e quantidade', () => {
    expect(a.formato).toBe('arquivo-0');
    expect(a.protoVer).toBe(100);
    expect(a.inicioS).toBe(1792152000);
    expect(new Date(a.inicioS * 1000).toISOString()).toBe('2026-10-16T12:00:00.000Z');
    expect(a.leituras).toHaveLength(2);
  });

  it('valores brutos exatamente como o float32 da placa', () => {
    expect(a.medicoes[0]).toEqual({
      temperatura: Math.fround(34.8), umidade: 55, eco2: 400, tvoc: 180, id: 0,
    });
    expect(a.leituras[1].tempBruto).toBe(Math.fround(34.95));
    expect(a.leituras[1].rhBruto).toBe(55.5);
  });

  it('centésimos derivados do bruto, sem perder o bruto', () => {
    expect(a.leituras[0].tempC100).toBe(3480);
    expect(a.leituras[1].tempC100).toBe(3495);
    expect(a.leituras[1].rhX100).toBe(5550);
    expect(a.leituras[0].eco2Ppm).toBe(400);
    expect(a.leituras[0].tvocPpb).toBe(180);
  });

  it('o que o arquivo não traz fica NULL, nunca zero', () => {
    for (const l of a.leituras) {
      expect(l.gasStatus).toBeNull();
      expect(l.aqiUba).toBeNull();
      expect(l.battMv).toBeNull();
      expect(l.flags).toBe(0);
    }
  });

  it('chave: início × 1.000.000 + número; contador bruto = número', () => {
    expect(a.leituras.map((l) => l.seq)).toEqual([1792152000000000, 1792152000000001]);
    expect(a.leituras.map((l) => l.tNode)).toEqual([0, 1]);
    expect(inicioDoSeq(a.leituras[1].seq)).toBe(1792152000);
    expect(idDoSeq(a.leituras[1].seq)).toBe(1);
  });

  it('codificar devolve exatamente os mesmos bytes', () => {
    expect(codificarArquivo0(a.inicioS, a.medicoes)).toEqual(EXEMPLO);
  });
});

describe('arquivo-0: recusa inteira quando não fecha', () => {
  const base = codificarArquivo0(1792152000, [
    { temperatura: 34, umidade: 60, eco2: 400, tvoc: 100 },
    { temperatura: 34.1, umidade: 61, eco2: 410, tvoc: 110 },
    { temperatura: 34.2, umidade: 62, eco2: 420, tvoc: 120 },
  ]);

  it('menos de 8 bytes', () => {
    expect(motivo(() => lerArquivo('arquivo-0', base.subarray(0, 7)))).toBe('curto-demais');
    expect(motivo(() => lerArquivo('arquivo-0', new Uint8Array(0)))).toBe('curto-demais');
  });

  it('(tamanho − 8) não é múltiplo de 16, em qualquer sobra', () => {
    for (const sobra of [1, 6, 8, 15]) {
      expect(motivo(() => lerArquivo('arquivo-0', base.subarray(0, 8 + 16 + sobra))))
        .toBe('tamanho-nao-multiplo');
    }
  });

  it('um registro de 20 bytes que por acaso fecha em múltiplo de 16 é pego pela numeração', () => {
    // 4 medições de 20 bytes (um campo a mais) = 80 bytes = 5 × 16.
    const mudado = new Uint8Array(8 + 80);
    const v = new DataView(mudado.buffer);
    v.setUint32(0, 1792152000, true);
    for (let k = 0; k < 4; k++) {
      const o = 8 + k * 20;
      v.setFloat32(o, 34, true); v.setFloat32(o + 4, 60, true);
      v.setUint16(o + 8, 400, true); v.setUint16(o + 10, 100, true);
      v.setUint32(o + 12, 0xAABBCCDD, true); // o campo novo (ID da placa)
      v.setUint32(o + 16, k, true);
    }
    expect(motivo(() => lerArquivo('arquivo-0', mudado))).toBe('numeracao-fora-de-ordem');
  });

  it('numeração que não começa em 0, repete ou pula', () => {
    const comIds = (ids: number[]) => codificarArquivo0(1792152000,
      ids.map((id) => ({ temperatura: 34, umidade: 60, eco2: 400, tvoc: 100, id })));
    expect(motivo(() => lerArquivo('arquivo-0', comIds([1, 2, 3])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-0', comIds([0, 1, 0])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-0', comIds([0, 2])))).toBe('numeracao-fora-de-ordem');
    expect(motivo(() => lerArquivo('arquivo-0', comIds([0, 1, 2])))).toBeNull();
  });

  it('hora de início que não cabe em 32 bits', () => {
    const b = base.slice();
    new DataView(b.buffer).setUint32(4, 1, true);
    expect(motivo(() => lerArquivo('arquivo-0', b))).toBe('inicio-fora-de-faixa');
  });

  it('formato desconhecido é recusado, nunca tentado', () => {
    expect(() => lerArquivo('arquivo-9', base)).toThrow(FormatoDeArquivoDesconhecidoError);
    expect(FORMATO_DE_ARQUIVO_ATUAL).toBe('arquivo-0');
  });
});

describe('arquivo-0: casos válidos', () => {
  it('arquivo só com a hora de início: nenhuma leitura', () => {
    const a = lerArquivo('arquivo-0', codificarArquivo0(1792152000, []));
    expect(a.leituras).toEqual([]);
    expect(a.inicioS).toBe(1792152000);
  });

  it('hora de início 0 (placa nova que tomou HELLO como hora) é formato válido', () => {
    const a = lerArquivo('arquivo-0', codificarArquivo0(0, [{ temperatura: 30, umidade: 50, eco2: 400, tvoc: 0 }]));
    expect(a.leituras[0].seq).toBe(0);
  });

  it('valor que não é número vira NULL com motivo em flags', () => {
    const a = lerArquivo('arquivo-0', codificarArquivo0(1792152000, [
      { temperatura: Number.NaN, umidade: 60, eco2: 400, tvoc: 100 },
      { temperatura: 34, umidade: Number.POSITIVE_INFINITY, eco2: 400, tvoc: 100 },
      { temperatura: Number.NaN, umidade: Number.NaN, eco2: 0, tvoc: 0 },
    ]));
    expect(a.leituras[0]).toMatchObject({ tempC100: null, tempBruto: null, rhX100: 6000,
      flags: FLAG_TEMPERATURA_NAO_E_NUMERO });
    expect(a.leituras[1]).toMatchObject({ rhX100: null, rhBruto: null, tempC100: 3400,
      flags: FLAG_UMIDADE_NAO_E_NUMERO });
    expect(a.leituras[2].flags).toBe(FLAG_TEMPERATURA_NAO_E_NUMERO | FLAG_UMIDADE_NAO_E_NUMERO);
    // eCO₂ e TVOC zero são o que o sensor informou: ficam como vieram.
    expect(a.leituras[2]).toMatchObject({ eco2Ppm: 0, tvocPpb: 0 });
  });

  it('negativo pequeno não vira -0', () => {
    const a = lerArquivo('arquivo-0', codificarArquivo0(1792152000, [
      { temperatura: -0.004, umidade: 0, eco2: 0, tvoc: 0 },
    ]));
    expect(Object.is(a.leituras[0].tempC100, -0)).toBe(false);
    expect(a.leituras[0].tempC100).toBe(0);
  });

  it('a chave fica abaixo de 2^53 até a maior hora de início possível', () => {
    expect(Number.isSafeInteger(seqDaMedicao(2 ** 32 - 1, MULTIPLICADOR_DO_INICIO - 1))).toBe(true);
  });

  it('o mesmo arquivo maior (placa que não apagou) dá as mesmas chaves às medições antigas', () => {
    const m = (k: number) => ({ temperatura: 34 + k / 10, umidade: 60, eco2: 400, tvoc: 100 + k });
    const pequeno = lerArquivo('arquivo-0', codificarArquivo0(1792152000, [0, 1, 2].map(m)));
    const grande = lerArquivo('arquivo-0', codificarArquivo0(1792152000, [0, 1, 2, 3, 4].map(m)));
    expect(grande.leituras.slice(0, 3)).toEqual(pequeno.leituras);
  });
});
