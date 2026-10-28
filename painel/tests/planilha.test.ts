/**
 * Gerador da planilha (FR-034, FR-035, SC-009, SC-010).
 */
import { describe, expect, it } from 'vitest';
import type { ColmeiaMacro, LeituraPainel, NoSensorPainel } from '../src/dados/porta';
import {
  BOM, LIMITE_LEITURAS, celulaCentesimos, celulaTexto, gerarPlanilha, nomeDoArquivo,
} from '../src/dominio/planilha';
import { diaDeIso } from '../src/dominio/calendario';

const DIA = diaDeIso('2026-10-01')!;
const T0 = DIA * 86_400_000 + 13 * 3_600_000; // 01/10/2026 13:00:00 UTC

const colmeia: ColmeiaMacro = {
  colmeiaId: 'b1~h-1', colmeiaNome: 'Jandaíra; a do canto', apicultorNome: 'Maria Teste',
  localNome: 'Meliponário "Pé de Serra"', criacao: 'meliponineo', municipio: 'Mossoró', uf: 'RN',
  ultimaLeituraMs: T0, leituras: 3, excluidas: 1,
};

const no: NoSensorPainel = { noId: 'N1', colmeiaId: 'b1~h-1', correcaoTempC100: -50, modeloSensor: 'AHT21 + ENS160' };

function leitura(seq: number, p: Partial<LeituraPainel> = {}): LeituraPainel {
  return {
    colmeiaId: 'b1~h-1', noId: 'N1', seq, tUtcMs: T0 + seq * 900_000, qualidadeHora: 'ancorada',
    epocaSensor: 1, versaoFormato: 1, tempC100: 3456, umidX100: 6789, tvocPpb: 512,
    eco2Ppm: 680, situacaoGas: 0, ...p,
  };
}

function gerar(leituras: LeituraPainel[]) {
  return gerarPlanilha({
    geradaEmMs: T0, deDia: DIA, ateDia: DIA + 6, colmeias: [colmeia], nos: [no], leituras,
  });
}

const LEITURAS = [
  leitura(2, { tempC100: -149, situacaoGas: 2 }),
  leitura(1),
  leitura(5, { tUtcMs: null, qualidadeHora: 'desconhecida', umidX100: null, tvocPpb: null, eco2Ppm: null, situacaoGas: null }),
  leitura(4, { qualidadeHora: 'estimada', versaoFormato: 2 }),
];

function linhasDe(arquivo: string): string[] {
  return arquivo.slice(BOM.length).split('\r\n');
}

/** Separa as células de uma linha como um programa de planilha faria (aspas inclusas). */
function celulas(linha: string): string[] {
  const saida: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { saida.push(atual); atual = ''; }
    else atual += c;
  }
  saida.push(atual);
  return saida;
}

function corpo(arquivo: string): string[][] {
  const linhas = linhasDe(arquivo);
  const vazia = linhas.indexOf('');
  return linhas.slice(vazia + 2).filter((l) => l !== '').map(celulas);
}

describe('formato que abre direto em planilha pt-BR', () => {
  it('começa com BOM UTF-8 e usa \\r\\n', () => {
    const a = gerar(LEITURAS);
    expect(a.charCodeAt(0)).toBe(0xfeff);
    expect(new TextEncoder().encode(a).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(a.endsWith('\r\n')).toBe(true);
    expect(a.slice(1)).not.toMatch(/[^\r]\n/);
  });

  it('separa colunas por ponto e vírgula, com o mesmo número de colunas em toda linha de dado', () => {
    const a = gerar(LEITURAS);
    const linhas = linhasDe(a);
    const cab = linhas[linhas.indexOf('') + 1].split(';');
    expect(cab).toContain('temperatura_bruta_c');
    for (const l of corpo(a)) expect(l).toHaveLength(cab.length);
    // O nome com ";" continua numa célula só.
    expect(corpo(a)[0][1]).toBe('Jandaíra; a do canto');
    expect(corpo(a)[0][2]).toBe('Meliponário "Pé de Serra"');
  });

  it('vírgula decimal, sem arredondar o bruto, e correção em coluna separada', () => {
    const a = gerar(LEITURAS);
    const linhas = linhasDe(a);
    const cab = linhas[linhas.indexOf('') + 1].split(';');
    const col = (n: string) => cab.indexOf(n);
    const [l1, l2] = corpo(a);
    expect(l1[col('numero_da_leitura')]).toBe('1');
    expect(l1[col('temperatura_bruta_c')]).toBe('34,56');
    expect(l1[col('umidade_bruta_pct')]).toBe('67,89');
    expect(l1[col('correcao_temperatura_c')]).toBe('-0,50');
    expect(l2[col('temperatura_bruta_c')]).toBe('-1,49');
    expect(l1[col('data_hora_utc')]).toBe('01/10/2026 13:15:00');
    expect(a).not.toMatch(/\d\.\d{2}(;|\r)/);
  });

  it('valor ausente é célula vazia, nunca 0', () => {
    const a = gerar(LEITURAS);
    const linhas = linhasDe(a);
    const cab = linhas[linhas.indexOf('') + 1].split(';');
    const sem = corpo(a).find((l) => l[cab.indexOf('numero_da_leitura')] === '5')!;
    expect(sem[cab.indexOf('umidade_bruta_pct')]).toBe('');
    expect(sem[cab.indexOf('volateis_tvoc_ppb')]).toBe('');
    expect(sem[cab.indexOf('data_hora_utc')]).toBe('');
    expect(sem[cab.indexOf('qualidade_hora')]).toBe('desconhecida');
    expect(sem[cab.indexOf('amostra_excluida')]).toBe('não');
  });

  it('marca a amostra excluída com palavra', () => {
    const a = gerar(LEITURAS);
    const linhas = linhasDe(a);
    const cab = linhas[linhas.indexOf('') + 1].split(';');
    const exc = corpo(a).find((l) => l[cab.indexOf('numero_da_leitura')] === '2')!;
    expect(exc[cab.indexOf('amostra_excluida')]).toBe('sim');
    expect(exc[cab.indexOf('situacao_sensor_gas')]).toBe('2');
  });

  it('protege texto com separador, aspas e fórmula', () => {
    expect(celulaTexto('Jandaíra; a do canto')).toBe('"Jandaíra; a do canto"');
    expect(celulaTexto('Meliponário "Pé de Serra"')).toBe('"Meliponário ""Pé de Serra"""');
    expect(celulaTexto('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaTexto('+55')).toBe("'+55");
    expect(celulaTexto('@soma')).toBe("'@soma");
    expect(celulaTexto('-2+3+cmd|calc')).toBe("'-2+3+cmd|calc");
    expect(celulaTexto('\t=1+1')).toBe("'\t=1+1");
    // Quebra de linha dentro do nome não pode partir a linha da planilha.
    expect(celulaTexto('Caixa\r\nnova')).toBe('"Caixa\r\nnova"');
    expect(celulaTexto('Caixa\nnova')).toBe('"Caixa\nnova"');
    expect(celulaTexto(null)).toBe('');
    expect(celulaCentesimos(null)).toBe('');
    expect(celulaCentesimos(0)).toBe('0,00');
  });
});

describe('cabeçalho de proveniência', () => {
  const a = gerar(LEITURAS);
  const cab = linhasDe(a).slice(0, linhasDe(a).indexOf(''));
  const texto = cab.join('\n');
  const linha = (rotulo: string) => cab.find((l) => l.startsWith(`${rotulo};`)) ?? '';

  it('declara sensor e versões do formato que estão no arquivo', () => {
    expect(linha('Nó sensor')).toContain('N1;AHT21 + ENS160;versão do formato de dados: v1, v2');
    expect(linha('Nó sensor')).toContain('-0,50 °C');
  });

  it('declara que eCO₂ é derivado e NÃO é CO₂', () => {
    expect(linha('Grandezas derivadas')).toMatch(/eCO₂ é estimado .* a partir dos voláteis/);
    expect(linha('Grandezas derivadas')).toMatch(/Não é CO₂ medido/);
    // Toda menção a CO₂ é "eCO₂" ou "não é CO₂".
    const soltas = texto.replace(/eCO₂|eco2/gi, '').replace(/[Nn]ão é CO₂/g, '').replace(/nao_e_co2/g, '');
    expect(soltas).not.toMatch(/CO₂|CO2/i);
  });

  it('conta amostras excluídas e leituras', () => {
    expect(linha('Amostras excluídas')).toMatch(/^Amostras excluídas;1;/);
    expect(linha('Leituras')).toBe('Leituras;4');
  });

  it('conta a qualidade da hora, e as contagens somam o total', () => {
    expect(linha('Qualidade da hora')).toBe('Qualidade da hora;ancorada 2, estimada 1, desconhecida 1');
  });

  it('declara que coordenadas não são coletadas e que não há nome de pessoa', () => {
    expect(linha('Coordenadas')).toMatch(/Não são coletadas/);
    expect(a).not.toContain('Maria Teste');
    expect(a).not.toMatch(/latitude;|longitude;|lat;|lon;/i);
  });

  it('avisa que voláteis absolutos não se comparam entre colmeias', () => {
    expect(linha('Voláteis')).toMatch(/não é comparável entre colmeias/);
  });

  it('nome da coluna de eCO₂ diz que não é CO₂', () => {
    const colunas = linhasDe(a)[linhasDe(a).indexOf('') + 1];
    expect(colunas).toContain('eco2_estimado_ppm_nao_e_co2');
    expect(colunas.split(';').filter((c) => /co2/i.test(c))).toEqual(['eco2_estimado_ppm_nao_e_co2']);
  });
});

describe('arquivo', () => {
  it('nome com as datas do recorte, sem nome de pessoa', () => {
    expect(nomeDoArquivo(DIA, DIA + 6)).toBe('bee-sertao-leituras-2026-10-01-a-2026-10-07.csv');
  });

  it('o limite é o do orçamento do painel (50 mil linhas)', () => {
    expect(LIMITE_LEITURAS).toBe(50_000);
  });
});
