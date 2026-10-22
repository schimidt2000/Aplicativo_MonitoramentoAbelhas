/**
 * Construtor da série (FR-027, FR-028, SC-008). Se estes testes quebram, o
 * gráfico passa a desenhar linha sobre dia sem dado ou a ligar duas épocas.
 */
import { describe, expect, it } from 'vitest';
import type { ResumoDiario } from '../src/dados/porta';
import {
  agregarPorTrilha, diasSemLeitura, montarSerie, trocasDeSensor,
} from '../src/dominio/serie';

function resumo(dia: number, parcial: Partial<ResumoDiario> = {}): ResumoDiario {
  return {
    noId: 'N1', dia, epocaSensor: 1,
    tempMinC100: 3300, tempMedC100: 3400, tempMaxC100: 3500,
    umidMedX100: 6000, tvocMedPpb: 500, validas: 96, excluidas: 0,
    ...parcial,
  };
}

const temp = (r: ResumoDiario) => r.tempMedC100;

describe('série por calendário', () => {
  it('percorre o calendário: dia ausente vira null no lugar dele, nunca zip', () => {
    // Dias 100, 101 e 105: 102, 103 e 104 não vieram do servidor.
    const rs = [resumo(100), resumo(101, { tempMedC100: 3410 }), resumo(105, { tempMedC100: 3450 })];
    const s = montarSerie(rs, 100, 106, temp);
    expect(s.dias).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(s.trilhas).toHaveLength(1);
    expect(s.trilhas[0].y).toEqual([3400, 3410, null, null, null, 3450, null]);
  });

  it('a ordem de chegada das linhas não muda a série', () => {
    const rs = [resumo(105, { tempMedC100: 3450 }), resumo(100), resumo(101, { tempMedC100: 3410 })];
    expect(montarSerie(rs, 100, 105, temp).trilhas[0].y).toEqual([3400, 3410, null, null, null, 3450]);
  });

  it('um índice por dia do intervalo, mesmo sem nenhuma linha', () => {
    const s = montarSerie([], 10, 16, temp);
    expect(s.dias).toHaveLength(7);
    expect(s.trilhas).toEqual([]);
  });

  it('linhas fora do intervalo ficam de fora', () => {
    const s = montarSerie([resumo(99), resumo(100), resumo(103)], 100, 102, temp);
    expect(s.trilhas[0].y).toEqual([3400, null, null]);
  });

  it('valor nulo no resumo continua nulo (nunca 0)', () => {
    const s = montarSerie([resumo(1, { umidMedX100: null })], 1, 1, (r) => r.umidMedX100);
    expect(s.trilhas[0].y).toEqual([null]);
  });

  it('troca de época quebra a série: cada época é uma trilha, com null fora dela', () => {
    const rs = [
      resumo(1), resumo(2),
      resumo(3, { epocaSensor: 2, tempMedC100: 3600 }), resumo(4, { epocaSensor: 2, tempMedC100: 3610 }),
    ];
    const s = montarSerie(rs, 1, 4, temp);
    expect(s.trilhas.map((tr) => tr.epoca)).toEqual([1, 2]);
    expect(s.trilhas[0].y).toEqual([3400, 3400, null, null]);
    expect(s.trilhas[1].y).toEqual([null, null, 3600, 3610]);
    // Nenhum dia tem valor nas duas trilhas: não existe segmento que ligue 2 a 3.
    for (let i = 0; i < s.dias.length; i++) {
      expect(s.trilhas[0].y[i] !== null && s.trilhas[1].y[i] !== null).toBe(false);
    }
  });

  it('troca de época no meio do dia: o mesmo dia aparece uma vez em cada trilha', () => {
    const rs = [resumo(1), resumo(2), resumo(2, { epocaSensor: 2, tempMedC100: 3700 }), resumo(3, { epocaSensor: 2 })];
    const s = montarSerie(rs, 1, 3, temp);
    expect(s.trilhas[0].y).toEqual([3400, 3400, null]);
    expect(s.trilhas[1].y).toEqual([null, 3700, 3400]);
  });

  it('troca de nó sensor também quebra a série, mesmo com a mesma época', () => {
    const rs = [resumo(1), resumo(2, { noId: 'N2' })];
    const s = montarSerie(rs, 1, 2, temp);
    expect(s.trilhas.map((tr) => tr.noId)).toEqual(['N1', 'N2']);
    expect(s.trilhas[0].y).toEqual([3400, null]);
    expect(s.trilhas[1].y).toEqual([null, 3400]);
  });

  it('resumo duplicado para (nó, dia, época) não é escolhido em silêncio', () => {
    expect(() => montarSerie([resumo(1), resumo(1)], 1, 1, temp)).toThrow(/duplicado/);
  });
});

describe('lacunas e trocas', () => {
  it('conta os dias do intervalo sem nenhuma linha', () => {
    expect(diasSemLeitura([resumo(100), resumo(101), resumo(105)], 100, 106)).toBe(4);
  });

  it('dia com linha em qualquer trilha não é lacuna', () => {
    const rs = [resumo(1), resumo(2, { epocaSensor: 2 })];
    expect(diasSemLeitura(rs, 1, 2)).toBe(0);
  });

  it('aponta o dia em que começa cada trilha nova', () => {
    const rs = [resumo(1), resumo(2), resumo(5, { epocaSensor: 2 }), resumo(9, { epocaSensor: 3 })];
    expect(trocasDeSensor(rs, 1, 10)).toEqual([5, 9]);
    expect(trocasDeSensor(rs, 6, 10)).toEqual([]);
  });

  it('dois nós ao mesmo tempo na mesma colmeia não são troca de sensor', () => {
    const rs = [1, 2, 3, 4].flatMap((d) => [resumo(d), resumo(d, { noId: 'N2' })]);
    expect(trocasDeSensor(rs, 1, 4)).toEqual([]);
    // Um segundo nó que entra no meio, com o primeiro ainda ligado, também não.
    const meio = [resumo(1), resumo(2), resumo(3), resumo(4), resumo(3, { noId: 'N2' }), resumo(4, { noId: 'N2' })];
    expect(trocasDeSensor(meio, 1, 4)).toEqual([]);
  });

  it('nó novo que entra depois que o anterior parou é troca', () => {
    const rs = [resumo(1), resumo(2), resumo(3, { noId: 'N2' }), resumo(4, { noId: 'N2' })];
    expect(trocasDeSensor(rs, 1, 4)).toEqual([3]);
    // No mesmo dia da saída do anterior também.
    expect(trocasDeSensor([resumo(1), resumo(2), resumo(2, { noId: 'N2' })], 1, 2)).toEqual([2]);
  });

  it('época nova de um nó é troca mesmo com outro nó ligado ao lado', () => {
    const rs = [
      ...[1, 2, 3, 4].map((d) => resumo(d, { noId: 'N2' })),
      resumo(1), resumo(2), resumo(3, { epocaSensor: 2 }), resumo(4, { epocaSensor: 2 }),
    ];
    expect(trocasDeSensor(rs, 1, 4)).toEqual([3]);
  });
});

describe('agregado do período', () => {
  it('é por trilha, com excluídas somadas ao lado e sem média de médias', () => {
    const rs = [
      resumo(1, { tempMinC100: 3000, tempMaxC100: 3600, umidMedX100: 5500, validas: 90, excluidas: 6 }),
      resumo(2, { tempMinC100: 3100, tempMaxC100: 3700, umidMedX100: 6500, validas: 3, excluidas: 93 }),
      resumo(3, { epocaSensor: 2, tempMinC100: 2000, tempMaxC100: 2100, validas: 10, excluidas: 1 }),
    ];
    const a = agregarPorTrilha(rs, 1, 3);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({
      epoca: 1, diasComLinha: 2, tempMenorC100: 3000, tempMaiorC100: 3700,
      umidMediaMenorX100: 5500, umidMediaMaiorX100: 6500, validas: 93, excluidas: 99,
    });
    // A época 2 não contamina a época 1.
    expect(a[1]).toMatchObject({ epoca: 2, tempMenorC100: 2000, validas: 10, excluidas: 1 });
  });

  it('valor nulo não vira 0 no agregado', () => {
    const a = agregarPorTrilha([resumo(1, { tempMinC100: null, tempMaxC100: null })], 1, 1);
    expect(a[0].tempMenorC100).toBeNull();
    expect(a[0].tempMaiorC100).toBeNull();
  });
});
