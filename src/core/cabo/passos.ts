/**
 * A parte da tela de coleta pelo cabo que é conta, não desenho (feature 005,
 * FR-026, FR-027). Pura e testável.
 */
import { CABECALHO_DO_FORMATO, FORMATO_DE_ARQUIVO_ATUAL, REGISTRO_DE_MEDICAO } from '../decode/arquivo';
import { t, tp, type ChaveTexto } from '../i18n';
import { INTERVALO_PADRAO_S } from '../hora';
import type { ProgressoDaSessao } from './sessao';
import type { DesfechoDaSessao } from './protocolo';

/** Quanto a placa fica acordada esperando o HELLO depois do botão (firmware: 30 s). */
export const PLACA_ACORDADA_MS = 30_000;

/**
 * Segundos que faltam para a placa voltar a dormir, contados do instante em
 * que ela acordou — o mais perto do botão que o app consegue saber: quando a
 * porta dela aparece, ou, sem isso, o toque em Coletar. null: não se sabe.
 */
export function segundosAteDormir(acordouMs: number | null, agoraMs: number): number | null {
  if (acordouMs === null) return null;
  return Math.max(0, Math.ceil((acordouMs + PLACA_ACORDADA_MS - agoraMs) / 1000));
}

/** Quantas leituras inteiras já chegaram, pelos bytes (no formato que a coleta usa). */
export function leiturasPelosBytes(recebidos: number): number {
  const cabecalho = CABECALHO_DO_FORMATO[FORMATO_DE_ARQUIVO_ATUAL];
  return Math.max(0, Math.floor((recebidos - cabecalho) / REGISTRO_DE_MEDICAO));
}

/** Fração de 0 a 1 para a barra; só existe enquanto o arquivo chega. */
export function fracaoDoProgresso(p: ProgressoDaSessao): number | null {
  if (p.fase !== 'recebendo') return null;
  return p.total > 0 ? Math.min(1, p.recebidos / p.total) : 1;
}

/**
 * As opções de intervalo da placa no cadastro, em segundos (FR-016). 7200 é o
 * padrão de produção do firmware; 25 s é o ciclo estimado da placa de TESTE
 * (10 s de sono + 10 s à espera do sensor de gás + 3 s + boot), a medir na
 * bancada (docs/integracao-firmware.md).
 */
export const OPCOES_INTERVALO_PLACA_S = [7200, 3600, 10800, 1800, 25] as const;

/** "A cada 2 horas", "A cada 30 minutos"…, com "— padrão" no de 7200 s. */
export function rotuloDoIntervalo(segundos: number): string {
  let r: string;
  if (segundos === 25) r = t('colmeia.intervalo.teste');
  else if (segundos % 3600 === 0) r = tp('colmeia.intervalo.horas', segundos / 3600);
  else if (segundos % 60 === 0) r = t('colmeia.intervalo.minutos', { n: segundos / 60 });
  else r = tp('colmeia.intervalo.segundos', segundos);
  return segundos === INTERVALO_PADRAO_S ? t('colmeia.intervalo.padrao', { opcao: r }) : r;
}

/** A frase de cada fase da conversa (FR-027): "Salvando no celular" durante a gravação. */
export const TEXTO_DA_FASE: Record<ProgressoDaSessao['fase'], ChaveTexto> = {
  conversando: 'caboColeta.estado.conversando',
  recebendo: 'caboColeta.estado.recebendo',
  gravando: 'caboColeta.estado.gravando',
  confirmando: 'caboColeta.estado.confirmando',
  recomecando: 'caboColeta.estado.recomecando',
};

/**
 * O resultado oferece "Configurar placa nova" (FR-025) quando a placa está sem
 * arquivo: é nova e não tomou o HELLO como data, ou perdeu o arquivo. A que
 * tomou o HELLO como data 0 já mede: o caminho é coletar de novo.
 */
export function pedeConfigurarPlacaNova(d: DesfechoDaSessao): boolean {
  if (d.motivo === 'placa-nova') return d.tomouHelloComoHora !== true;
  return d.arquivoNaPlaca === 'sem-arquivo';
}
