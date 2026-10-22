/**
 * Os textos da coleta pelo cabo (feature 005, FR-005, FR-011, FR-028, FR-030).
 * Puro: `core/coleta/mensagens.ts` chama daqui para a colmeia que veio do cabo,
 * e a tela só desenha `montarAvisos`/`resumir`, como em toda coleta.
 *
 * Toda mensagem diz três coisas: o que ficou salvo no celular, o que a placa
 * ainda tem, e o que fazer. Nunca o código cru da placa (`ERROR:…`).
 */
import { t, tp, type ChaveTexto } from '../i18n';
import { fmtDataHoraPartes } from '../format';
import type { CodigoProblema, ItemDeAviso, ResultadoNo } from '../coleta/resultado';
import type { MotivoSemCabo } from '../bancada/mensagens';
import type { TransportErrorCode } from '../ports/transport';
import type { DesfechoPlacaNova } from './placaNova';

function item(id: string, gravidade: ItemDeAviso['gravidade'], titulo: string, detalhe: string): ItemDeAviso {
  return { id, gravidade, titulo, detalhe };
}

type Par = { titulo: ChaveTexto; detalhe: ChaveTexto };
const par = <K extends string>(k: K) => ({
  titulo: `caboColeta.problema.${k}.titulo`, detalhe: `caboColeta.problema.${k}.detalhe`,
}) as const;

/** Chaves escritas por extenso no tipo: chave que não existe falha no typecheck. */
const PROBLEMAS = {
  nao_respondeu: par('nao_respondeu'), placa_nova: par('placa_nova'), data_zero: par('data_zero'),
  placa_nova_talvez: par('placa_nova_talvez'),
  caiu: par('caiu'), parou: par('parou'), crc: par('crc'), protocolo: par('protocolo'),
  formato: par('formato'), nao_salvou: par('nao_salvou'), nao_entendeu: par('nao_entendeu'),
  sem_arquivo: par('sem_arquivo'), nao_leu: par('nao_leu'), perdeu_arquivo: par('perdeu_arquivo'),
} satisfies Record<string, Par>;

/** O problema da colmeia que veio do cabo. `codigo` já saiu de `problemaDoDesfecho`. */
export function problemaDoCabo(no: ResultadoNo, codigo: CodigoProblema): ItemDeAviso {
  const d = no.cabo!.desfecho;
  const id = `${no.deviceId}:cabo:${codigo}`;
  const v = { nome: no.nome };
  const p = (chave: keyof typeof PROBLEMAS) =>
    item(id, 'problema', t(PROBLEMAS[chave].titulo, v), t(PROBLEMAS[chave].detalhe, v));

  switch (d.motivo) {
    case 'placa-nao-respondeu': return p('nao_respondeu');
    case 'placa-nova':
      if (d.tomouHelloComoHora === null) return p('placa_nova_talvez');
      return p(d.tomouHelloComoHora ? 'data_zero' : 'placa_nova');
    case 'conexao-caiu': return p('caiu');
    case 'sem-resposta': return p('parou');
    case 'crc-diferente': return p('crc');
    case 'protocolo-desconhecido': return p('protocolo');
    case 'formato-desconhecido': return p('formato');
    case 'nao-gravou': return p('nao_salvou');
    case 'erro-da-placa':
      if (d.arquivoNaPlaca === 'sem-arquivo') return p(d.gravado ? 'perdeu_arquivo' : 'sem_arquivo');
      if (d.erroDaPlaca === 'BAD_COMMAND') return p('nao_entendeu');
      return p('nao_leu');
    default:
      return item(id, 'problema', t('coleta.problema.inesperado.titulo', v), t('coleta.problema.inesperado.detalhe'));
  }
}

/** Os avisos da colmeia que veio do cabo: o que se sabe da placa e da hora. */
export function avisosDoCabo(no: ResultadoNo): ItemDeAviso[] {
  const c = no.cabo!;
  const d = c.desfecho;
  const id = (s: string) => `${no.deviceId}:cabo:${s}`;
  const avisos: ItemDeAviso[] = [];

  if (c.colmeiaPeloMac) {
    avisos.push(item(id('outra-colmeia'), 'aviso',
      t('caboColeta.aviso.outra_colmeia.titulo', { nome: no.nome }), t('caboColeta.aviso.outra_colmeia.detalhe')));
  }

  // O que a placa ainda tem — só faz sentido dizer se o celular gravou.
  if (d.gravado) {
    if (d.motivo === 'hora-nao-enviada') {
      avisos.push(item(id('hora-errada'), 'aviso',
        t('caboColeta.aviso.hora_errada.titulo'), t('caboColeta.aviso.hora_errada.detalhe')));
    } else if (d.arquivoNaPlaca === 'continua') {
      avisos.push(item(id('continua'), 'aviso',
        t('caboColeta.aviso.continua.titulo'), t('caboColeta.aviso.continua.detalhe')));
    } else if (d.arquivoNaPlaca === 'nao-se-sabe') {
      avisos.push(item(id('nao-se-sabe'), 'aviso',
        t('caboColeta.aviso.nao_se_sabe.titulo'), t('caboColeta.aviso.nao_se_sabe.detalhe')));
    }
  }

  // Colisão de chave (D-519): nunca calada. A gravada não muda; a nova fica no bruto.
  if (c.conflitos > 0) {
    avisos.push(item(id('conflito'), 'aviso', t('caboColeta.aviso.conflito.titulo'),
      tp('caboColeta.aviso.conflito.detalhe', c.conflitos)));
  }

  // A conta da hora (FR-030). Só quando houve conferência e ela não fechou.
  const f = c.conferencia;
  if (f && f.veredito !== 'fecha' && c.semHora > 0) {
    if (f.veredito === 'inicio-implausivel') {
      avisos.push(item(id('inicio'), 'aviso',
        t('caboColeta.aviso.inicio_errado.titulo'), t('caboColeta.aviso.inicio_errado.detalhe')));
    } else {
      const base = f.veredito === 'a-mais'
        ? 'caboColeta.aviso.hora_nao_fechou.a_mais' as const
        : 'caboColeta.aviso.hora_nao_fechou.a_menos' as const;
      avisos.push(item(id('hora'), 'aviso', t('caboColeta.aviso.hora_nao_fechou.titulo'),
        `${tp(base, c.semHora, { medicoes: f.medicoes, esperadas: f.esperadas })} ${t('caboColeta.aviso.hora_nao_fechou.intervalo')}`));
    }
  }
  return avisos;
}

/** "21/10, 14:05" — curto, para a nota do período. */
function dataHora(ms: number): string {
  return t('hora.data_hora', fmtDataHoraPartes(ms));
}

/** Frases do cabeçalho de sucesso. */
export function notasDoCabo(no: ResultadoNo): string[] {
  const c = no.cabo!;
  const notas: string[] = [];
  if (c.desfecho.arquivoNaPlaca === 'apagou') notas.push(t('caboColeta.nota.recomecou'));
  if (c.periodo) {
    notas.push(t('caboColeta.nota.periodo', { de: dataHora(c.periodo.deMs), ate: dataHora(c.periodo.ateMs) }));
  }
  return notas;
}

/** Onde não há porta serial: o que dizer (FR-032). Títulos da 004; textos próprios da coleta. */
export function textoSemCaboParaColeta(m: MotivoSemCabo): { titulo: string; detalhe: string } {
  switch (m) {
    case 'app-no-celular':
      return { titulo: t('cabo.sem_suporte.titulo.computador'), detalhe: t('caboColeta.sem_suporte.app_no_celular') };
    case 'navegador-de-celular':
      return { titulo: t('cabo.sem_suporte.titulo.computador'), detalhe: t('caboColeta.sem_suporte.navegador_de_celular') };
    case 'endereco-nao-seguro':
      return { titulo: t('cabo.sem_suporte.titulo.endereco'), detalhe: t('cabo.sem_suporte.endereco_nao_seguro') };
    case 'navegador-sem-porta-serial':
      return { titulo: t('cabo.sem_suporte.titulo.navegador'), detalhe: t('cabo.sem_suporte.navegador_sem_porta') };
  }
}

/** Problema antes da conversa: escolher ou abrir a porta. */
export type ProblemaDaPorta = 'nenhuma' | 'nao-apareceu' | 'ocupada' | 'sem-permissao';

const PORTA: Record<ProblemaDaPorta, Par> = {
  'nenhuma': { titulo: 'caboColeta.porta.nenhuma.titulo', detalhe: 'caboColeta.porta.nenhuma.detalhe' },
  'nao-apareceu': { titulo: 'caboColeta.porta.nao_apareceu.titulo', detalhe: 'caboColeta.porta.nao_apareceu.detalhe' },
  'ocupada': { titulo: 'caboColeta.porta.ocupada.titulo', detalhe: 'caboColeta.porta.ocupada.detalhe' },
  'sem-permissao': { titulo: 'caboColeta.porta.sem_permissao.titulo', detalhe: 'caboColeta.porta.sem_permissao.detalhe' },
};

export function textoDoProblemaDaPorta(p: ProblemaDaPorta): { titulo: string; detalhe: string } {
  return { titulo: t(PORTA[p].titulo), detalhe: t(PORTA[p].detalhe) };
}

/**
 * O código do erro ao escolher ou abrir a porta → o problema que a tela mostra.
 * Escolher: lista fechada sem escolha é "nenhuma". Abrir: porta indisponível é
 * quase sempre outro programa com ela (o Monitor Serial da IDE do Arduino).
 */
export function problemaDaPortaPorErro(
  codigo: TransportErrorCode | null, fase: 'escolher' | 'abrir',
): ProblemaDaPorta {
  if (codigo === 'permission') return 'sem-permissao';
  if (fase === 'escolher') return 'nenhuma';
  return codigo === 'unavailable' ? 'ocupada' : 'nao-apareceu';
}

/**
 * O que a tela "Configurar placa nova" diz (FR-024). Só afirma que a placa
 * começou a medir quando ela mesma disse; sem confirmação, diz que não deu
 * para confirmar.
 */
export function textoDaPlacaNova(d: DesfechoPlacaNova): { titulo: string; detalhe: string; ok: boolean } {
  switch (d.resultado) {
    case 'confirmada':
      return {
        ok: true, titulo: t('placaNova.confirmada.titulo'),
        detalhe: t('placaNova.confirmada.detalhe', { data: dataHora((d.horaRecebidaS ?? d.horaEnviadaS) * 1000) }),
      };
    case 'sem-confirmacao':
      return { ok: false, titulo: t('placaNova.sem_confirmacao.titulo'), detalhe: t('placaNova.sem_confirmacao.detalhe') };
    case 'ja-configurada':
      return { ok: false, titulo: t('placaNova.ja_configurada.titulo'), detalhe: t('placaNova.ja_configurada.detalhe') };
    case 'placa-nao-salvou':
      return { ok: false, titulo: t('placaNova.nao_salvou.titulo'), detalhe: t('placaNova.nao_salvou.detalhe') };
    case 'conexao-caiu':
      return { ok: false, titulo: t('placaNova.caiu.titulo'), detalhe: t('placaNova.caiu.detalhe') };
  }
}
