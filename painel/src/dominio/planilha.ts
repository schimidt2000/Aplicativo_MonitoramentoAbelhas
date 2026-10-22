/**
 * Gerador da planilha (US5, FR-034, FR-035).
 *
 * Formato pensado para abrir direto num programa de planilha configurado para
 * português do Brasil, sem diálogo de importação:
 *  - UTF-8 com BOM (sem ele, acentos viram lixo no programa mais comum);
 *  - ";" entre colunas, porque "," é o separador decimal;
 *  - vírgula decimal, sem separador de milhar nos números;
 *  - fim de linha \r\n;
 *  - valor ausente é célula VAZIA, nunca 0 (Princípio III);
 *  - texto que começa com = + - @ é neutralizado, porque nome de colmeia é
 *    digitado por gente e a planilha executaria como fórmula.
 *
 * Valores brutos, na resolução gravada (centésimos convertidos exatamente).
 * É a exceção declarada à regra de precisão de tela: arredondar aqui destruiria
 * informação de quem vai analisar, e o cabeçalho declara a exatidão do sensor.
 *
 * Sem nome de pessoa: a colmeia é identificada por código, nome, local e
 * município. Sem coordenada: ela não existe em lugar nenhum (FR-022).
 */
import {
  amostraExcluida,
  type ColmeiaMacro, type LeituraPainel, type NoSensorPainel, type QualidadeHora,
} from '../dados/porta';
import { t } from '../textos';
import { isoDeDia } from './calendario';
import { decimal, fmtDataHoraUtc, fmtDia } from './formato';

export const BOM = '﻿';
export const SEPARADOR = ';';
export const FIM_DE_LINHA = '\r\n';

/** Acima disso a planilha fica pesada demais para abrir; a tela pede para estreitar. */
export const LIMITE_LEITURAS = 50_000;

/** Célula de texto: neutraliza fórmula e protege separador, aspas e quebra. */
export function celulaTexto(s: string | null): string {
  if (s === null || s === '') return '';
  let v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[;"\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Centésimos -> número com 2 casas e vírgula. null -> célula vazia. */
export function celulaCentesimos(v: number | null): string {
  return v === null ? '' : decimal(v / 100, 2);
}

export function celulaInteiro(v: number | null): string {
  return v === null ? '' : String(v);
}

function linha(celulas: string[]): string {
  return celulas.join(SEPARADOR);
}

export interface EntradaPlanilha {
  geradaEmMs: number;
  deDia: number;
  ateDia: number;
  colmeias: ColmeiaMacro[];
  nos: NoSensorPainel[];
  leituras: LeituraPainel[];
}

const QUALIDADES: QualidadeHora[] = ['ancorada', 'estimada', 'desconhecida'];

function textoQualidade(q: QualidadeHora): string {
  return t(`hora.${q}`);
}

export function contarQualidades(leituras: LeituraPainel[]): Record<QualidadeHora, number> {
  const c: Record<QualidadeHora, number> = { ancorada: 0, estimada: 0, desconhecida: 0 };
  for (const l of leituras) c[l.qualidadeHora]++;
  return c;
}

/** O arquivo inteiro, já com BOM. */
export function gerarPlanilha(e: EntradaPlanilha): string {
  const colmeias = new Map(e.colmeias.map((c) => [c.colmeiaId, c]));
  const nos = new Map(e.nos.map((n) => [n.noId, n]));
  const excluidas = e.leituras.filter((l) => amostraExcluida(l.situacaoGas)).length;
  const qualidades = contarQualidades(e.leituras);

  const cab: string[][] = [
    [t('planilha.cab.titulo')],
    [t('planilha.cab.gerada_em'), t('planilha.cab.utc', { quando: fmtDataHoraUtc(e.geradaEmMs) })],
    [t('planilha.cab.periodo'), t('planilha.cab.periodo_valor', { de: fmtDia(e.deDia), ate: fmtDia(e.ateDia) })],
    [t('planilha.cab.colmeias'), String(e.colmeias.length)],
    [t('planilha.cab.leituras'), String(e.leituras.length)],
    [t('planilha.cab.excluidas'), String(excluidas), t('planilha.cab.excluidas_explicacao')],
    [
      t('planilha.cab.qualidade_hora'),
      QUALIDADES.map((q) => `${textoQualidade(q)} ${qualidades[q]}`).join(', '),
    ],
    [t('planilha.cab.derivadas'), t('planilha.cab.derivadas_eco2'), t('planilha.cab.derivadas_hora')],
    [t('planilha.cab.volateis'), t('planilha.cab.volateis_texto')],
    [t('planilha.cab.valores'), t('planilha.cab.valores_texto')],
    [t('planilha.cab.aquecimento'), t('planilha.cab.aquecimento_texto')],
    [t('planilha.cab.coordenadas'), t('planilha.cab.coordenadas_texto')],
    [t('planilha.cab.pessoas'), t('planilha.cab.pessoas_texto')],
  ];

  // Proveniência por nó sensor: modelo, versões do formato e correção.
  const nosUsados = [...new Set(e.leituras.map((l) => l.noId))].sort();
  for (const noId of nosUsados) {
    const no = nos.get(noId);
    // Versões tiradas das próprias leituras do arquivo: é o que está nele.
    const versoes = [...new Set(e.leituras.filter((l) => l.noId === noId).map((l) => l.versaoFormato))]
      .sort((a, b) => a - b)
      .map((v) => `v${v}`)
      .join(', ');
    cab.push([
      t('planilha.cab.sensor'),
      noId,
      no?.modeloSensor ?? t('planilha.cab.nao_informado'),
      t('planilha.cab.formato', { versoes }),
      t('planilha.cab.correcao', { valor: decimal((no?.correcaoTempC100 ?? 0) / 100, 2) }),
    ]);
  }

  const colunas = [
    'codigo_colmeia', 'colmeia', 'local', 'municipio', 'uf', 'no_sensor', 'seq',
    'data_hora_utc', 'qualidade_hora', 'epoca_sensor', 'versao_formato',
    'temperatura_bruta', 'correcao_temperatura', 'umidade_bruta', 'volateis',
    'eco2', 'situacao_gas', 'amostra_excluida',
  ] as const;

  const ordenadas = [...e.leituras].sort(
    (a, b) =>
      a.colmeiaId.localeCompare(b.colmeiaId) || a.noId.localeCompare(b.noId) || a.seq - b.seq,
  );

  const linhas: string[] = cab.map((c) => linha(c.map(celulaTexto)));
  linhas.push('');
  linhas.push(linha(colunas.map((c) => celulaTexto(t(`planilha.col.${c}`)))));
  for (const l of ordenadas) {
    const c = colmeias.get(l.colmeiaId);
    const no = nos.get(l.noId);
    linhas.push(linha([
      celulaTexto(l.colmeiaId),
      celulaTexto(c?.colmeiaNome ?? null),
      celulaTexto(c?.localNome ?? null),
      celulaTexto(c?.municipio ?? null),
      celulaTexto(c?.uf ?? null),
      celulaTexto(l.noId),
      String(l.seq),
      l.tUtcMs === null ? '' : fmtDataHoraUtc(l.tUtcMs),
      textoQualidade(l.qualidadeHora),
      String(l.epocaSensor),
      String(l.versaoFormato),
      celulaCentesimos(l.tempC100),
      celulaCentesimos(no?.correcaoTempC100 ?? 0),
      celulaCentesimos(l.umidX100),
      celulaInteiro(l.tvocPpb),
      celulaInteiro(l.eco2Ppm),
      celulaInteiro(l.situacaoGas),
      amostraExcluida(l.situacaoGas) ? t('planilha.sim') : t('planilha.nao'),
    ]));
  }
  return BOM + linhas.join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

export function nomeDoArquivo(deDia: number, ateDia: number): string {
  return t('planilha.arquivo', { de: isoDeDia(deDia), ate: isoDeDia(ateDia) });
}
