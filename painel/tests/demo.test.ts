/**
 * Fonte de demonstração: determinística, com os casos difíceis presentes, e
 * resumo diário pela mesma regra do celular e do servidor.
 */
import { describe, expect, it } from 'vitest';
import { criarConjuntoDemo, criarFonteDemo, resumir } from '../src/dados/demo';
import type { LeituraPainel } from '../src/dados/porta';
import { MS_DIA } from '../src/dominio/calendario';
import { diasSemLeitura, montarSerie, trocasDeSensor } from '../src/dominio/serie';

const HOJE = 20_750;

function leitura(seq: number, p: Partial<LeituraPainel>): LeituraPainel {
  return {
    colmeiaId: 'c', noId: 'G1', seq, tUtcMs: 20_300 * MS_DIA + seq * 3_600_000, qualidadeHora: 'ancorada',
    epocaSensor: 1, versaoFormato: 1, tempC100: 3400, umidX100: 6000, tvocPpb: 800, eco2Ppm: 600,
    situacaoGas: 0, ...p,
  };
}

describe('resumo diário com a regra do celular e do servidor', () => {
  it('reproduz o dia 20300 do caso de referência do servidor', () => {
    // servidor/golden/resumo-diario.json (frente do servidor): GOLD0001, dia 20300.
    const r = resumir([
      leitura(1, { tempC100: 3400, umidX100: 6000, tvocPpb: 800 }),
      leitura(2, { tempC100: 3500, umidX100: 6100, tvocPpb: 1000 }),
      leitura(3, { tempC100: 3603, umidX100: null, tvocPpb: 5000, situacaoGas: 2 }),
      leitura(4, { tempC100: null, umidX100: 6201, tvocPpb: null, eco2Ppm: null, situacaoGas: null }),
    ]);
    expect(r).toEqual([{
      noId: 'G1', dia: 20_300, epocaSensor: 1, tempMinC100: 3400, tempMedC100: 3501,
      tempMaxC100: 3603, umidMedX100: 6100, tvocMedPpb: 900, validas: 3, excluidas: 1,
    }]);
  });

  it('dia só com gás inválido não gera linha (é a lacuna do gráfico)', () => {
    expect(resumir([leitura(1, { situacaoGas: 1 }), leitura(2, { situacaoGas: 3 })])).toEqual([]);
  });

  it('média negativa trunca em direção a zero, como o servidor', () => {
    const r = resumir([leitura(1, { tempC100: -150 }), leitura(2, { tempC100: -149 })]);
    expect(r[0].tempMedC100).toBe(-149);
  });

  it('troca de época no mesmo dia gera uma linha por época', () => {
    const r = resumir([leitura(1, {}), leitura(2, { epocaSensor: 2 })]);
    expect(r.map((x) => x.epocaSensor)).toEqual([1, 2]);
  });

  it('leitura sem hora fica fora do resumo', () => {
    expect(resumir([leitura(1, { tUtcMs: null, qualidadeHora: 'desconhecida' })])).toEqual([]);
  });
});

describe('conjunto de demonstração', () => {
  const demo = criarConjuntoDemo(HOJE);

  it('é determinístico: mesmo dia, mesmos números', () => {
    const outro = criarConjuntoDemo(HOJE);
    expect(outro.macro()).toEqual(demo.macro());
    expect(outro.leiturasDe('demo-mel-02').slice(0, 50)).toEqual(demo.leiturasDe('demo-mel-02').slice(0, 50));
  });

  it('tem um meliponário e apiários', () => {
    const criacoes = new Set(demo.macro().map((c) => c.criacao));
    expect(criacoes).toEqual(new Set(['meliponineo', 'apis']));
    const apicultores = new Set(demo.macro().map((c) => c.apicultorNome));
    expect(apicultores.size).toBeGreaterThanOrEqual(2);
  });

  it('tem colmeia sem leitura nenhuma', () => {
    expect(demo.macro().some((c) => c.ultimaLeituraMs === null && c.leituras === 0)).toBe(true);
  });

  it('tem lacuna de dias sem nó ligado', () => {
    const rs = demo.resumosDe('demo-mel-03');
    expect(diasSemLeitura(rs, HOJE - 12, HOJE - 6)).toBe(3);
  });

  it('tem dias com leitura mas sem resumo, porque todas as amostras foram excluídas', () => {
    const dia = HOJE - 15;
    const doDia = demo.leiturasDe('demo-api-01').filter((l) => Math.floor(l.tUtcMs! / MS_DIA) === dia);
    expect(doDia.length).toBeGreaterThan(0);
    expect(doDia.every((l) => l.situacaoGas !== 0)).toBe(true);
    expect(demo.resumosDe('demo-api-01').some((r) => r.dia === dia)).toBe(false);
    // E o gráfico mostra lacuna nesse dia.
    const s = montarSerie(demo.resumosDe('demo-api-01'), dia - 1, dia + 1, (r) => r.tempMedC100);
    expect(s.trilhas[0].y[1]).toBeNull();
  });

  it('tem troca de sensor no meio de um dia, que quebra a série', () => {
    const rs = demo.resumosDe('demo-mel-02');
    const dia = HOJE - 20;
    expect(rs.filter((r) => r.dia === dia).map((r) => r.epocaSensor)).toEqual([1, 2]);
    expect(trocasDeSensor(rs, HOJE - 30, HOJE)).toEqual([dia]);
  });

  it('tem dias com algumas amostras excluídas, contadas no resumo', () => {
    const rs = demo.resumosDe('demo-mel-01');
    expect(rs.some((r) => r.excluidas > 0 && r.validas > 0)).toBe(true);
  });

  it('as contagens da visão geral batem com as leituras', () => {
    for (const c of demo.macro()) {
      const ls = demo.leiturasDe(c.colmeiaId);
      expect(c.leituras).toBe(ls.length);
      expect(c.excluidas).toBe(ls.filter((l) => l.situacaoGas !== null && l.situacaoGas !== 0).length);
    }
  });

  it('a fonte respeita o limite pedindo só limite + 1 linhas', async () => {
    const fonte = criarFonteDemo(HOJE);
    const ids = demo.macro().map((c) => c.colmeiaId);
    const ls = await fonte.leituras(ids, (HOJE - 200) * MS_DIA, (HOJE + 1) * MS_DIA, 1000);
    expect(ls).toHaveLength(1001);
  });

  it('entrar no modo demonstração não pede senha e cria sessão', async () => {
    const fonte = criarFonteDemo(HOJE);
    expect(await fonte.sessaoAtual()).toBeNull();
    const r = await fonte.entrar('', '');
    expect(r.ok).toBe(true);
    expect(await fonte.sessaoAtual()).not.toBeNull();
  });
});
