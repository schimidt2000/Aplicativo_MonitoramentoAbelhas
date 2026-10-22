/**
 * Planilha "Salvar o que foi visto" (feature 004, FR-019 a FR-021). Puro: monta
 * o texto; quem baixa o arquivo é a tela.
 *
 * Para abrir direto no Excel e no LibreOffice em pt-BR:
 *  - UTF-8 com BOM (sem ele, o Excel lê "ç" como "Ã§");
 *  - `;` entre colunas e vírgula decimal;
 *  - SEM a linha `sep=;`: com ela, o Excel ignora o BOM e estraga os acentos;
 *  - fim de linha `\r\n`.
 *
 * Proveniência no topo (Princípio VI): origem, formato das linhas, sensores,
 * o que é derivado, de onde vem a hora e as contagens — inclusive quantas
 * leituras tinham o sensor de gás fora do normal.
 *
 * Valores como a placa mandou, com as 2 casas dela, e a linha original: é
 * registro bruto de bancada, para comparar com um termômetro. A tela mostra
 * 1 e 0 casas. As colunas dizem "como veio".
 */
import { t } from '../i18n';
import { fmtDataHoraBancada, estadoDoGasNaTela } from './apresentacao';
import type { LeituraVista } from './sessao';

const BOM = '\uFEFF';
const FIM = '\r\n';

/** Centésimos -> "34,52", "-3,25", "-0,05". Exato, sem float. */
export function centesimosEmTexto(c100: number): string {
  const abs = Math.abs(c100);
  const sinal = c100 < 0 ? '-' : '';
  return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Texto numa célula. Entre aspas quando precisa; e, se começar como fórmula
 * (`=`, `+`, `-`, `@`), ganha um apóstrofo na frente para a planilha não
 * executar o que veio da porta.
 */
export function celulaDeTexto(s: string): string {
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\r\n]|^\s|\s$/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export interface DadosDaPlanilha {
  formato: string;
  leituras: readonly LeituraVista[];
  inicioMs: number | null;
  ilegiveis: number;
  descartadas: number;
}

export interface Planilha { nomeDoArquivo: string; conteudo: string }

const dois = (n: number) => String(n).padStart(2, '0');

export function nomeDaPlanilha(geradaEmMs: number): string {
  const d = new Date(geradaEmMs);
  const data = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}h${dois(d.getMinutes())}`;
  return t('cabo.planilha.arquivo', { data });
}

export function montarPlanilha(dados: DadosDaPlanilha, geradaEmMs: number): Planilha {
  const fora = dados.leituras.filter((l) => l.leitura.gasStatus !== 0).length;

  const proveniencia = [
    t('cabo.planilha.titulo'),
    t('cabo.planilha.origem'),
    t('cabo.planilha.formato', { formato: dados.formato }),
    t('cabo.planilha.sensores'),
    t('cabo.planilha.derivadas'),
    t('cabo.planilha.hora'),
    t('cabo.planilha.valores'),
    t('cabo.planilha.inicio', {
      hora: dados.inicioMs === null ? '—' : fmtDataHoraBancada(dados.inicioMs),
    }),
    // Números crus aqui: o separador de milhar "." confundiria a planilha.
    t('cabo.planilha.contagens', {
      leituras: dados.leituras.length,
      fora,
      ilegiveis: dados.ilegiveis,
      descartadas: dados.descartadas,
    }),
  ].map(celulaDeTexto);

  const cabecalho = [
    t('cabo.planilha.col.hora_utc'),
    t('cabo.planilha.col.hora_local'),
    t('cabo.planilha.col.temperatura'),
    t('cabo.planilha.col.umidade'),
    t('cabo.planilha.col.vazio'),
    t('cabo.planilha.col.status_gas'),
    t('cabo.planilha.col.situacao_gas'),
    t('cabo.planilha.col.volateis'),
    t('cabo.planilha.col.indice_ar'),
    t('cabo.planilha.col.estimado'),
    t('cabo.planilha.col.linha'),
  ].map(celulaDeTexto).join(';');

  const linhas = dados.leituras.map(({ chegadaMs, leitura: l, bruta }) => {
    const vazio = l.motivoTemp || l.motivoUmidade ? t('cabo.planilha.motivo.sem_numero') : '';
    return [
      new Date(chegadaMs).toISOString(),
      fmtDataHoraBancada(chegadaMs),
      l.tempC100 === null ? '' : centesimosEmTexto(l.tempC100),
      l.rhX100 === null ? '' : centesimosEmTexto(l.rhX100),
      celulaDeTexto(vazio),
      String(l.gasStatus),
      celulaDeTexto(estadoDoGasNaTela(l.estadoGas, l.gasStatus).texto),
      String(l.tvocPpb),
      String(l.aqiUba),
      String(l.eco2Ppm),
      celulaDeTexto(bruta),
    ].join(';');
  });

  const conteudo = BOM + [...proveniencia, '', cabecalho, ...linhas].join(FIM) + FIM;
  return { nomeDoArquivo: nomeDaPlanilha(geradaEmMs), conteudo };
}
