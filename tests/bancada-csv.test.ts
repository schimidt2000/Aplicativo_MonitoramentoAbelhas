/**
 * Planilha "Salvar o que foi visto" (feature 004): abre em pt-BR sem ajuste
 * (BOM, `;`, vírgula decimal), carrega proveniência e nunca chama o eCO₂ de
 * CO₂ (SC-005, FR-019 a FR-021).
 */
import { describe, expect, it } from 'vitest';
import { SessaoDoMonitor } from '@/core/bancada/sessao';
import { celulaDeTexto, centesimosEmTexto, montarPlanilha, nomeDaPlanilha } from '@/core/bancada/csv';

const T0 = Date.UTC(2026, 9, 21, 13, 0, 0);
const L_OK = 'T=34.52C RH=61.20% Status=0 AQI=2 TVOC=180ppb eCO2=650ppm';
const L_AQ = 'T=-3.25C RH=55.03% Status=1 (WARMUP) AQI=1 TVOC=0ppb eCO2=400ppm';
const L_NAN = 'T=nanC RH=50.00% Status=0 AQI=1 TVOC=5ppb eCO2=400ppm';

function planilha() {
  const s = new SessaoDoMonitor();
  s.receber({ texto: 'AHT20 OK', corte: null }, T0);
  s.receber({ texto: L_OK, corte: null }, T0 + 1000);
  s.receber({ texto: L_AQ, corte: null }, T0 + 2000);
  s.receber({ texto: 'T=34.5', corte: 'interrompida' }, T0 + 2500);
  s.receber({ texto: L_NAN, corte: null }, T0 + 3000);
  return montarPlanilha({
    formato: s.formato, leituras: s.leituras, inicioMs: s.inicioMs,
    ilegiveis: s.contagens.ilegiveis, descartadas: s.contagens.descartadas,
  }, T0 + 4000);
}

const linhasDe = (conteudo: string) => conteudo.replace(/^\uFEFF/, '').split('\r\n');

describe('planilha da sessão', () => {
  it('começa com BOM, separa por ; e termina linhas em \\r\\n, sem "sep="', () => {
    const { conteudo } = planilha();
    expect(conteudo.startsWith('\uFEFF')).toBe(true);
    expect(conteudo).not.toMatch(/^\uFEFF?sep=/m);
    expect(conteudo.endsWith('\r\n')).toBe(true);
    expect(conteudo.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('cabeçalho de proveniência: origem, nada gravado, formato, sensores, derivadas, hora e contagens', () => {
    const topo = linhasDe(planilha().conteudo).slice(0, 10).join('\n');
    expect(topo).toMatch(/Nada foi gravado no aplicativo/);
    expect(topo).toMatch(/bancada-0/);
    expect(topo).toMatch(/AHT20\/AHT21/);
    expect(topo).toMatch(/ENS160/);
    expect(topo).toMatch(/eCO₂ estimado não é CO₂/);
    expect(topo).toMatch(/relógio deste computador/);
    expect(topo).toMatch(/Leituras: 3\. Com o sensor de gás fora do normal \(código da situação diferente de 0\): 1\. Linhas ilegíveis: 1\./);
  });

  it('uma linha por leitura, na ordem, com o mesmo número de colunas do cabeçalho', () => {
    const ls = linhasDe(planilha().conteudo);
    const iCab = ls.findIndex((l) => l.startsWith('Hora UTC;'));
    expect(iCab).toBeGreaterThan(0);
    expect(ls[iCab - 1]).toBe('');
    const dados = ls.slice(iCab + 1).filter((l) => l !== '');
    expect(dados).toHaveLength(3);
    const colunas = ls[iCab].split(';').length;
    for (const d of dados) expect(d.split(';').length).toBe(colunas);
  });

  it('valores como a placa mandou, com vírgula decimal, e a linha original intacta', () => {
    const ls = linhasDe(planilha().conteudo);
    const iCab = ls.findIndex((l) => l.startsWith('Hora UTC;'));
    const [ok, aq, nan] = ls.slice(iCab + 1, iCab + 4).map((l) => l.split(';'));

    expect(ok[0]).toBe('2026-10-21T13:00:01.000Z');
    expect(ok.slice(2, 4)).toEqual(['34,52', '61,20']);
    expect(ok.slice(5)).toEqual(['0', 'Sensor de gás pronto', '180', '2', '650', L_OK]);

    expect(aq[2]).toBe('-3,25');
    expect(aq[5]).toBe('1');
    expect(aq[6]).toBe('Sensor de gás aquecendo');

    // Valor em branco com motivo — nunca zero.
    expect(nan[2]).toBe('');
    expect(nan[4]).toBe('a placa mandou sem número');
  });

  it('nunca rotula nada como CO₂ sem dizer que é estimado e que não é CO₂', () => {
    const { conteudo } = planilha();
    for (const l of linhasDe(conteudo)) {
      // Fora de "eCO₂" (inclusive o "eCO2=" da linha original da placa) e da
      // ressalva "não é CO₂", a palavra CO₂ não aparece.
      const resto = l.replace(/eCO[₂2]/g, '').replace(/não é CO₂/g, '');
      expect(resto).not.toMatch(/CO[₂2]/i);
    }
    expect(conteudo).toMatch(/eCO₂ estimado, não é CO₂ \(ppm\)/);
  });

  it('nome do arquivo com data e hora locais', () => {
    expect(nomeDaPlanilha(new Date(2026, 9, 21, 9, 5).getTime())).toBe('bancada-2026-10-21-09h05.csv');
  });
});

describe('células', () => {
  it('centésimos em texto, exatos', () => {
    expect(centesimosEmTexto(3452)).toBe('34,52');
    expect(centesimosEmTexto(-325)).toBe('-3,25');
    expect(centesimosEmTexto(-5)).toBe('-0,05');
    expect(centesimosEmTexto(0)).toBe('0,00');
    expect(centesimosEmTexto(10000)).toBe('100,00');
  });

  it('aspas quando precisa, e aspas internas dobradas', () => {
    expect(celulaDeTexto('simples')).toBe('simples');
    expect(celulaDeTexto('a;b')).toBe('"a;b"');
    expect(celulaDeTexto('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaDeTexto(' borda')).toBe('" borda"');
  });

  it('texto que começa como fórmula não vira fórmula', () => {
    expect(celulaDeTexto('=1+1')).toBe("'=1+1");
    expect(celulaDeTexto('+55')).toBe("'+55");
    expect(celulaDeTexto('-x')).toBe("'-x");
    expect(celulaDeTexto('@SOMA(A1)')).toBe("'@SOMA(A1)");
    expect(celulaDeTexto('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
  });
});
