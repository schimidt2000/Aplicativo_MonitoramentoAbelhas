/**
 * Do resultado da coleta para o que o apicultor lê. Puro e testável: a tela só
 * desenha o que sai daqui.
 */
import { t, tp } from '../i18n';
import { fmtDataHoraPartes } from '../format';
import type {
  CodigoProblema, ConflitoDeHora, ItemDeAviso, ResultadoColeta, ResultadoNo,
} from './resultado';
import { avisosDoCabo, notasDoCabo, problemaDoCabo } from '../cabo/mensagens';

/**
 * Frase que abre o detalhe de UMA colmeia: o que dela já ficou salvo. Sem nada
 * salvo, não diz nada — a garantia de que nada foi apagado já está no cabeçalho
 * da tela, e repeti-la em cada bloco só polui.
 */
function aberturaDe(salvas: number): string {
  return salvas > 0 ? tp('coleta.problema.salvas_antes', salvas) : '';
}

function juntar(...partes: string[]): string {
  return partes.filter((p) => p.length > 0).join(' ');
}

function problemaDaColmeia(
  no: ResultadoNo, codigo: CodigoProblema, gravou: boolean,
): ItemDeAviso {
  // Feature 005: a colmeia que veio do cabo tem textos próprios — a placa
  // dorme, tem botão, guarda o arquivo até a hora chegar.
  if (no.cabo) return problemaDoCabo(no, codigo);
  const id = `${no.deviceId}:${codigo}`;
  const v = { nome: no.nome };
  // Se a gravação final falhou, "ficaram salvas" seria mentira (Princípio VI).
  const abertura = (n: number) => (gravou ? aberturaDe(n) : '');

  switch (codigo) {
    case 'nao-conectou':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.nao_conectou.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.nao_conectou.detalhe')) };
    case 'conexao-caiu':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.conexao_caiu.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.conexao_caiu.detalhe')) };
    case 'formato-desconhecido':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.formato.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.formato.detalhe')) };
    case 'dados-corrompidos':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.corrompidos.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.corrompidos.detalhe')) };
    case 'nao-salvou':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.nao_salvou.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.nao_salvou.detalhe')) };
    case 'transporte-indisponivel':
      // Não é "dessa" colmeia: o rádio ou o cabo está indisponível para todas.
      // Mesmo id em todas, para `montarAvisos` mostrar uma vez só.
      return problemaGeral('transporte-indisponivel');
    case 'nenhuma-colmeia': // só existe na fase de busca; aqui seria um erro de lógica
    case 'placa-recusou':   // só existe no cabo, tratado acima
    case 'inesperado':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.inesperado.titulo', v),
        detalhe: juntar(abertura(no.inseridas), t('coleta.problema.inesperado.detalhe')) };
  }
}

function problemaGeral(codigo: CodigoProblema): ItemDeAviso {
  const id = `geral:${codigo}`;
  switch (codigo) {
    case 'nenhuma-colmeia':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.nenhuma_colmeia.titulo'),
        detalhe: t('coleta.problema.nenhuma_colmeia.detalhe') };
    case 'transporte-indisponivel':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.transporte.titulo'),
        detalhe: t('coleta.problema.transporte.detalhe') };
    case 'nao-salvou':
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.geral.nao_salvou.titulo'),
        detalhe: t('coleta.problema.nao_salvou.detalhe') };
    default:
      return { id, gravidade: 'problema',
        titulo: t('coleta.problema.geral.inesperado.titulo'),
        detalhe: t('coleta.problema.inesperado.detalhe') };
  }
}

/** Todos os avisos que a tela precisa mostrar, problemas antes de avisos. */
export function montarAvisos(r: ResultadoColeta): ItemDeAviso[] {
  const problemas: ItemDeAviso[] = [];
  const avisos: ItemDeAviso[] = [];

  const gravou = r.geral !== 'nao-salvou';
  if (r.geral) problemas.push(problemaGeral(r.geral));
  for (const no of r.nos) {
    if (no.problema) problemas.push(problemaDaColmeia(no, no.problema, gravou));
  }

  for (const no of r.nos) {
    // No cabo, "acertar o relógio" é a placa recomeçar o arquivo: outro texto.
    if (no.cabo) {
      avisos.push(...avisosDoCabo(no));
      continue;
    }
    if (no.relogio === 'falhou') {
      avisos.push({
        id: `${no.deviceId}:relogio`, gravidade: 'aviso',
        titulo: t('coleta.aviso.relogio_falhou.titulo', { nome: no.nome }),
        detalhe: t('coleta.aviso.relogio_falhou.detalhe'),
      });
    }
  }
  // A hora errada é do CELULAR, não de uma colmeia: um aviso só, mesmo com várias.
  if (r.nos.some((n) => !n.cabo && n.relogio === 'celular-suspeito')) {
    avisos.push({
      id: 'celular:relogio', gravidade: 'aviso',
      titulo: t('coleta.aviso.relogio_celular.titulo'),
      detalhe: t('coleta.aviso.relogio_celular.detalhe'),
    });
  }
  if (r.desconhecidos.length > 0) {
    avisos.push({
      id: 'desconhecidos', gravidade: 'aviso',
      titulo: tp('coleta.aviso.sensor_desconhecido.titulo', r.desconhecidos.length),
      detalhe: tp('coleta.aviso.sensor_desconhecido.detalhe', r.desconhecidos.length),
    });
  }

  // Mesmo id = mesmo aviso (ex.: "Bluetooth indisponível" vindo de várias colmeias).
  const vistos = new Set<string>();
  return [...problemas, ...avisos].filter((i) => {
    if (vistos.has(i.id)) return false;
    vistos.add(i.id);
    return true;
  });
}

export type Desfecho = 'sucesso' | 'com-problemas' | 'nao-coletou';

export interface Resumo {
  desfecho: Desfecho;
  /** Linhas novas gravadas em TODAS as colmeias, inclusive nas que deram problema. */
  salvas: number;
  recebidas: number;
  dias: number;
  /** Quantas colmeias tiveram o relógio acertado. */
  relogiosAcertados: number;
  /** Vale oferecer a tela de diagnóstico de conexão? */
  sugereDiagnostico: boolean;
  /** A gravação final no celular deu certo? Sem ela, nada pode ser dado como salvo. */
  gravouNoCelular: boolean;
  /** Frases a mais do cabeçalho de sucesso (coleta pelo cabo, feature 005). */
  notas: string[];
}

/**
 * Decide a manchete. Regra de ouro: um resultado só é "sucesso" se alguma
 * colmeia foi de fato coletada e nenhuma deu problema. Achar zero colmeias NUNCA
 * pode parecer "tudo em dia".
 */
export function resumir(r: ResultadoColeta): Resumo {
  const salvas = r.nos.reduce((a, n) => a + n.inseridas, 0);
  const recebidas = r.nos.reduce((a, n) => a + n.recebidas, 0);
  const dias = r.nos.reduce((a, n) => Math.max(a, n.dias), 0);
  // A placa do cabo "acertada" é outra coisa (recomeçou o arquivo): vai nas notas.
  const relogiosAcertados = r.nos.filter((n) => !n.cabo && n.relogio === 'acertado').length;

  const comProblema = r.nos.filter((n) => n.problema !== null);
  const semProblema = r.nos.filter((n) => n.problema === null);
  const temProblema = r.geral !== null || comProblema.length > 0;

  // "Sucesso" exige colmeia de fato coletada E nenhum problema. Se algo foi
  // salvo, a manchete reconhece isso ("terminou com problemas") em vez de dizer
  // "não consegui coletar", que contradiria as leituras que ficaram no celular.
  let desfecho: Desfecho;
  if (!temProblema && r.nos.length > 0) desfecho = 'sucesso';
  else if (salvas > 0 || semProblema.length > 0) desfecho = 'com-problemas';
  else desfecho = 'nao-coletou';

  const sugereDiagnostico =
    r.geral === 'nenhuma-colmeia'
    || r.geral === 'transporte-indisponivel'
    || comProblema.some((n) => !n.cabo
      && (n.problema === 'nao-conectou' || n.problema === 'transporte-indisponivel'));

  const gravouNoCelular = r.geral !== 'nao-salvou';
  const notas = r.nos.filter((n) => n.cabo && n.problema === null).flatMap(notasDoCabo);

  return {
    desfecho, salvas, recebidas, dias, relogiosAcertados, sugereDiagnostico, gravouNoCelular, notas,
  };
}

/* ---------- Feature 003: a pergunta "a data do celular está certa?" ---------- */

export interface AlvoDaPergunta extends ConflitoDeHora {
  deviceId: string;
  nome: string;
}

export interface PerguntaDeHora {
  /** Uma resposta vale para todas: a data é do celular, não da colmeia. */
  alvos: AlvoDaPergunta[];
  titulo: string;
  detalhe: string;
  /** "Este celular está marcando:" */
  rotuloDaHora: string;
  pergunta: string;
}

/** "Colmeia 07", "Colmeia 07 e Colmeia 03", "Colmeia 07, Colmeia 03 e Colmeia 11". */
function listaDeNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return t('hora.lista.e', { inicio: nomes.slice(0, -1).join(', '), ultimo: nomes[nomes.length - 1] });
}

/**
 * A pergunta da tela de resultado (FR-011), ou null se não há conflito. Só
 * aparece quando há algo que o apicultor pode fazer (FR-020).
 */
export function perguntaDeHora(r: ResultadoColeta): PerguntaDeHora | null {
  const comConflito = r.nos.filter((n) => n.conflitoDeHora !== undefined);
  if (comConflito.length === 0) return null;
  const n = comConflito.length;
  const nomes = listaDeNomes(comConflito.map((x) => x.nome));
  const naoAcertou = comConflito.some((x) => x.relogio === 'conflito');
  return {
    alvos: comConflito.map((x) => ({ ...x.conflitoDeHora!, deviceId: x.deviceId, nome: x.nome })),
    titulo: t('hora.conflito.titulo'),
    detalhe: juntar(
      tp('hora.conflito.detalhe', n, { nomes }),
      naoAcertou ? tp('hora.conflito.nao_acertei', n) : '',
    ),
    rotuloDaHora: t('hora.conflito.celular_mostra'),
    pergunta: t('hora.conflito.pergunta'),
  };
}

/** A data e a hora do celular, em destaque: "21/10/2026, 14:05". */
export function horaDoCelularEmDestaque(ms: number): string {
  return t('hora.data_hora', fmtDataHoraPartes(ms));
}

/**
 * O que dizer depois da resposta. `acertados`: quantas colmeias tiveram o
 * relógio acertado agora; `naoAlcancadas`: quantas ficam para a próxima coleta.
 */
export function textoDepoisDaResposta(
  resposta: 'sim' | 'nao',
  r: { gravou: boolean; acertados: number; naoAlcancadas: number },
): string {
  if (!r.gravou) return t('hora.conflito.nao_gravou');
  if (resposta === 'nao') return t('hora.conflito.nao.feito');
  return juntar(
    t('hora.conflito.sim.feito'),
    r.acertados > 0 ? tp('hora.conflito.sim.acertado', r.acertados) : '',
    r.naoAlcancadas > 0 ? t('hora.conflito.sim.depois') : '',
  );
}
