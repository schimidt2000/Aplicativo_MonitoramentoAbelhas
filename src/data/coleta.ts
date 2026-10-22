/**
 * Orquestra uma coleta, de ponta a ponta, e NUNCA lança.
 *
 * Por que existe fora da tela: quando este fluxo vivia dentro do componente, um
 * erro em `listarColmeias`, `connect` ou `db.persist` escapava e a tela ficava
 * presa em "Procurando…" sem nenhum aviso; achar zero colmeias aparecia como
 * "nenhuma leitura nova"; e uma queda em 62% dizia "0 leituras salvas" porque o
 * contador só somava colmeias terminadas.
 *
 * Aqui cada colmeia é isolada das outras (um problema numa não impede a coleta
 * das demais), todo erro vira um `CodigoProblema`, e o que foi salvo é contado
 * mesmo quando a colmeia deu problema.
 *
 * A hora (feature 003): toda coleta grava a sua referência de hora ANTES de
 * mandar a hora ao nó; se ela discorda das referências que já existem, a hora
 * não é enviada (FR-010). A hora de cada leitura só é avaliada no FIM, com todas
 * as leituras gravadas (`atualizarHoras`), porque só elas mostram se o nó
 * reiniciou no meio (D-302).
 */
import {
  TransportError,
  type Transport, type DiscoveredNode, type NodeSession, type SetTimeResult,
} from '@/core/ports/transport';
import { VersaoDesconhecidaError, protocoloSuportado } from '@/core/decode';
import { avaliarRelogioDoCelular } from '@/core/relogio';
import { FalhaDeGravacaoError, classificar, type FaseColeta } from '@/core/coleta/classificar';
import {
  desfechoDaSessao,
  type ConflitoDeHora, type EstadoRelogio, type ResultadoColeta, type ResultadoNo,
} from '@/core/coleta/resultado';
import { ingerirLote, registrarSessao } from './ingest';
import {
  atualizarHoras, estadoDaReferencia, gravarAvaliacao, gravarReferencia, grupoDaReferencia,
  haConflitoAntesDeTransferir, registrarResposta, type Resposta,
} from './hora';
import { listarColmeias, ultimoSeq, type LinhaColmeia } from './repo';
import type { SqlDb } from './types';

/** O acerto do relógio nunca pode segurar a coleta por mais que isto. */
const TIMEOUT_RELOGIO_MS = 5000;
/** Tudo já está gravado quando se fecha: esperar mais que isto só prende a tela. */
const TIMEOUT_FECHAR_MS = 3000;

export interface OpcoesColeta {
  /** Relógio do celular. Injetável para teste. */
  agora?: () => number;
  timeoutDescobertaMs?: number;
  timeoutRelogioMs?: number;
  aoProgredir?: (p: { nome: string; recebidas: number; total: number }) => void;
}

/** Embrulha erro de banco para a classificação saber que foi na gravação. */
function gravando<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new FalhaDeGravacaoError(e);
  }
}

function comTimeout<T>(p: Promise<T>, ms: number, aoEstourar: T): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<T>((resolve) => {
    id = setTimeout(() => resolve(aoEstourar), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(id));
}

export async function executarColeta(
  db: SqlDb, transporte: Transport, opts: OpcoesColeta = {},
): Promise<ResultadoColeta> {
  const agora = opts.agora ?? Date.now;
  const resultado: ResultadoColeta = { nos: [], desconhecidos: [], geral: null };

  let porDevice: Map<string, LinhaColmeia>;
  try {
    porDevice = new Map(
      listarColmeias(db)
        .filter((c): c is LinhaColmeia & { device_id: string } => c.device_id !== null)
        .map((c) => [c.device_id, c]),
    );
  } catch {
    return { ...resultado, geral: 'inesperado' };
  }

  // Fase 1: só procurar. A busca termina ANTES da primeira conexão — no Android
  // 8/9, conectar com a varredura aberta é a receita do status=133
  // (.claude/rules/transports.md). Quando o gerador termina, o transporte já
  // parou a varredura.
  const achados: DiscoveredNode[] = [];
  const vistos = new Set<string>();
  try {
    for await (const achado of transporte.discover({
      timeoutMs: opts.timeoutDescobertaMs ?? 10_000,
    })) {
      // Em BLE, o mesmo nó anuncia várias vezes por segundo: conta uma vez só.
      const chave = achado.deviceId ?? achado.handle;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push(achado);
    }
  } catch (e) {
    const codigo = classificar(e, 'procurando');
    // Se a busca caiu depois de achar alguma colmeia, "não achei nenhuma" seria mentira.
    resultado.geral = codigo === 'nenhuma-colmeia' && achados.length > 0 ? 'inesperado' : codigo;
  }

  if (resultado.geral === null && achados.length === 0) resultado.geral = 'nenhuma-colmeia';

  // Fase 2: coletar, uma colmeia por vez, cada uma isolada das outras.
  for (const achado of achados) {
    const colmeia = porDevice.get(achado.deviceId ?? '');
    if (!colmeia || colmeia.node_id === null) {
      resultado.desconhecidos.push(achado.deviceId ?? achado.handle);
      continue;
    }
    resultado.nos.push(await coletarColmeia(db, transporte, achado, colmeia, agora, opts));
  }

  // No navegador o banco vive em memória até este ponto: se não persistiu, o
  // usuário perde tudo ao fechar a aba. Isso TEM que ser avisado — e passa na
  // frente de qualquer outro problema geral, porque é o único que perde dado.
  try {
    await db.persist();
  } catch {
    resultado.geral = 'nao-salvou';
  }

  return resultado;
}

async function coletarColmeia(
  db: SqlDb,
  transporte: Transport,
  achado: DiscoveredNode,
  colmeia: LinhaColmeia,
  agora: () => number,
  opts: OpcoesColeta,
): Promise<ResultadoNo> {
  const nodeId = colmeia.node_id as number;
  const inicio = agora();
  const no: ResultadoNo = {
    deviceId: colmeia.device_id as string, nome: colmeia.nome,
    inseridas: 0, recebidas: 0, dias: 0, problema: null, relogio: 'nao-tentado',
  };

  let sessao: NodeSession | null = null;
  let refId: number | null = null;
  let protoVer: number | null = null;
  let periodoS = 900;
  let fase: FaseColeta = 'conectando';

  try {
    sessao = await transporte.connect(achado);
    protoVer = sessao.info.protoVer;
    periodoS = sessao.info.samplePeriodS;

    // Formato desconhecido é detectado ANTES de qualquer transferência: não faz
    // sentido puxar milhares de leituras para só então descobrir que não sabemos
    // lê-las. Nada parcial é gravado (Princípio IV).
    if (!protocoloSuportado(protoVer)) throw new VersaoDesconhecidaError(protoVer);

    // A hora do celular é a única fonte de hora absoluta. Antes do início do
    // projeto ela é impossível (pilha do relógio morta): a referência fica
    // guardada, rejeitada, e a hora não vai para o nó (FR-012, US2-4).
    const anchor = sessao.anchor;
    const info = sessao.info;
    const agoraMs = agora();
    const plausivel = avaliarRelogioDoCelular(agoraMs, null).plausivel
      && avaliarRelogioDoCelular(anchor.tUtcAtAnchorMs, null).plausivel;
    refId = gravando(() => gravarReferencia(db, nodeId, {
      origem: 'coleta', bootId: anchor.bootId, ligada: info.ligada ?? null,
      tNode: anchor.tNodeAtAnchor, tUtcMs: anchor.tUtcAtAnchorMs,
      monoMs: anchor.monoMs, rttMs: anchor.rttMs, src: anchor.src,
      aceita: plausivel && anchor.trusted && info.clockMode !== 'none',
      seqRef: info.newestSeq, modo: info.clockMode, periodoS: info.samplePeriodS,
      criadoMs: agoraMs,
    }));

    if (!plausivel) {
      no.relogio = 'celular-suspeito';
    } else if (gravando(() => haConflitoAntesDeTransferir(db, nodeId, refId as number))) {
      // A hora do celular não bate com o que o nó contou desde outra coleta.
      // Mandar qualquer uma das duas ao nó seria escolher no escuro (FR-010).
      no.relogio = 'conflito';
    } else {
      const grupo = refId;
      no.relogio = await acertarRelogio(
        sessao, agora, opts.timeoutRelogioMs ?? TIMEOUT_RELOGIO_MS,
        (enviadoMs) => gravando(() => {
          // FR-006: o acerto bem-sucedido também é referência, da mesma visita.
          gravarReferencia(db, nodeId, acertoComoReferencia(sessao!, enviadoMs, grupo));
        }),
      );
    }

    fase = 'transferindo';
    const desde = gravando(() => ultimoSeq(db, nodeId));
    for await (const lote of sessao.pullReadings(desde, {
      onProgress: (p) => opts.aoProgredir?.({
        nome: colmeia.nome, recebidas: p.received, total: p.total ?? 0,
      }),
    })) {
      // Commit por lote: é isto que faz a retomada funcionar de graça.
      const r = gravando(() => ingerirLote(
        db, nodeId, lote, { clockMode: sessao!.info.clockMode },
        sessao!.info.protoVer, sessao!.transport,
      ));
      no.inseridas += r.inseridas;
      no.recebidas += r.recebidas;
    }

    // Rede de proteção: uma transferência que acaba cedo SEM lançar não pode
    // virar "sucesso". Compara só o maior número de leitura (lacuna é normal;
    // contagem, não).
    const anunciado = sessao.info.newestSeq;
    if (anunciado > desde && gravando(() => ultimoSeq(db, nodeId)) < anunciado) {
      throw new TransportError('connection-lost', 'terminou antes da última leitura anunciada');
    }
  } catch (e) {
    no.problema = classificar(e, fase);
  } finally {
    if (sessao) {
      // Fechar nunca vira problema do usuário, nem pode prender a tela.
      try {
        await comTimeout(sessao.close(), TIMEOUT_FECHAR_MS, undefined);
      } catch { /* segue */ }
    }
  }

  no.dias = Math.round((no.recebidas * periodoS) / 86400);

  // A hora das leituras, avaliada com tudo o que de fato está no banco,
  // inclusive numa coleta parcial. Refaz os resumos se alguma hora mudou.
  try {
    if (no.inseridas > 0 || refId !== null) {
      const av = atualizarHoras(db, nodeId, 'coleta', agora());
      if (refId !== null) {
        if (estadoDaReferencia(av, refId) === 'em-conflito') {
          no.conflitoDeHora = { nodeId, refId };
          if (no.relogio !== 'acertado') no.relogio = 'conflito';
        } else if (no.relogio === 'conflito') {
          // A dúvida era um reinício do nó, não a data do celular (D-307).
          no.relogio = 'adiado';
        }
      }
    }
  } catch {
    if (no.problema === null) no.problema = 'nao-salvou';
  }

  // A sessão é registrada mesmo quando falha (FR-010). Se nem isso der para
  // gravar, o aviso ao usuário continua valendo.
  try {
    registrarSessao(db, nodeId, {
      startedMs: inicio, endedMs: agora(),
      protoVer: no.problema === 'formato-desconhecido' ? null : protoVer,
      recordCount: no.recebidas, outcome: desfechoDaSessao(no.problema),
      src: transporte.kind,
    });
  } catch { /* sem registro; o aviso na tela continua valendo */ }

  return no;
}

/**
 * Melhor esforço, com limite de tempo: o acerto do relógio nunca atrasa nem
 * impede a coleta. A hora das leituras vem das referências, não do nó.
 */
async function acertarRelogio(
  sessao: NodeSession,
  agora: () => number,
  timeoutMs: number,
  aoAcertar: (enviadoMs: number) => void,
): Promise<EstadoRelogio> {
  if (!sessao.info.caps.setTime) return 'nao-suportado';

  // `agora()` é lido aqui, no instante do envio, para o atraso não entrar na hora.
  const enviadoMs = agora();
  let r: SetTimeResult;
  try {
    r = await comTimeout<SetTimeResult>(
      sessao.setTime(enviadoMs), timeoutMs, { ok: false, reason: 'no-reply' },
    );
  } catch {
    return 'falhou';
  }
  if (!r.ok) return r.reason === 'unsupported' ? 'nao-suportado' : 'falhou';
  // Se gravar a referência do acerto falhar, o nó JÁ recebeu a hora: o estado
  // continua 'acertado' e a falha de gravação aparece pela coleta.
  try { aoAcertar(enviadoMs); } catch { /* a coleta segue */ }
  return 'acertado';
}

/**
 * O contador do nó no instante do acerto. Com contador desde que ligou, sai da
 * referência da sessão mais o que o celular mediu desde ela (segundos). No nó
 * que carimba a hora (`rtc`), o relógio dele PASSA a ser a hora enviada.
 */
function acertoComoReferencia(sessao: NodeSession, enviadoMs: number, grupo: number) {
  const a = sessao.anchor;
  const tNode = sessao.info.clockMode === 'rtc'
    ? Math.floor(enviadoMs / 1000)
    : a.tNodeAtAnchor + Math.round((enviadoMs - a.tUtcAtAnchorMs) / 1000);
  return {
    origem: 'acerto' as const, grupo, bootId: a.bootId, ligada: sessao.info.ligada ?? null,
    tNode,
    tUtcMs: enviadoMs, monoMs: a.monoMs, rttMs: a.rttMs, src: a.src,
    aceita: a.trusted && sessao.info.clockMode !== 'none',
    seqRef: sessao.info.newestSeq, modo: sessao.info.clockMode,
    periodoS: sessao.info.samplePeriodS, criadoMs: enviadoMs,
  };
}

/* ---------- A pergunta "a data do celular está certa?" (FR-011) ---------- */

export type RelogioDepoisDaResposta =
  /** "Não": nada a fazer no nó. */
  | 'nao-tentado'
  | 'acertado'
  /** O nó não foi achado agora; a próxima coleta acerta. */
  | 'nao-alcancou'
  | 'nao-suportado'
  | 'falhou';

export interface ResultadoDaResposta {
  /** A resposta ficou registrada no celular. */
  gravou: boolean;
  /** Referências que deixaram de valer. */
  revogadas: number;
  relogio: RelogioDepoisDaResposta;
}

/**
 * Registra a resposta do apicultor. "Sim" revoga as referências que discordam
 * da desta coleta, refaz as horas e religa ao nó para acertar o relógio na
 * mesma hora (US2, cenário 2). "Não" só registra (US2, cenário 3). Nunca lança.
 */
export async function responderPerguntaDeHora(
  db: SqlDb,
  transporte: Transport,
  alvo: ConflitoDeHora & { deviceId: string },
  resposta: Resposta,
  opts: { agora?: () => number; timeoutMs?: number } = {},
): Promise<ResultadoDaResposta> {
  const agora = opts.agora ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_RELOGIO_MS;
  const horaCelular = agora();

  let revogadas = 0;
  try {
    db.transaction(() => {
      revogadas = registrarResposta(db, alvo.nodeId, alvo.refId, resposta, horaCelular, horaCelular);
    });
  } catch {
    return { gravou: false, revogadas: 0, relogio: 'nao-tentado' };
  }

  let relogio: RelogioDepoisDaResposta = 'nao-tentado';
  if (resposta === 'sim' && avaliarRelogioDoCelular(agora(), null).plausivel) {
    relogio = await acertarAgora(db, transporte, alvo, agora, timeoutMs);
  }

  let gravou = true;
  try { await db.persist(); } catch { gravou = false; }
  return { gravou, revogadas, relogio };
}

export interface ResumoDaResposta {
  gravou: boolean;
  /** Colmeias com o relógio acertado agora. */
  acertados: number;
  /** Colmeias que não foram achadas agora: a próxima coleta acerta. */
  naoAlcancadas: number;
}

/**
 * A mesma resposta para todas as colmeias da pergunta: a data é do celular,
 * não da colmeia. Uma colmeia por vez, como na coleta. Nunca lança.
 */
export async function responderPergunta(
  db: SqlDb,
  transporte: () => Transport,
  alvos: Array<ConflitoDeHora & { deviceId: string }>,
  resposta: Resposta,
  opts: { agora?: () => number; timeoutMs?: number } = {},
): Promise<ResumoDaResposta> {
  const resumo: ResumoDaResposta = { gravou: true, acertados: 0, naoAlcancadas: 0 };
  for (const alvo of alvos) {
    let t: Transport;
    try { t = transporte(); } catch { resumo.gravou = false; continue; }
    const r = await responderPerguntaDeHora(db, t, alvo, resposta, opts);
    if (!r.gravou) resumo.gravou = false;
    if (r.relogio === 'acertado') resumo.acertados += 1;
    if (r.relogio === 'nao-alcancou' || r.relogio === 'falhou') resumo.naoAlcancadas += 1;
  }
  return resumo;
}

/** Procura SÓ este nó, conecta, manda a hora, fecha. Nunca lança. */
async function acertarAgora(
  db: SqlDb, transporte: Transport, alvo: ConflitoDeHora & { deviceId: string },
  agora: () => number, timeoutMs: number,
): Promise<RelogioDepoisDaResposta> {
  let sessao: NodeSession | null = null;
  try {
    let achado: DiscoveredNode | null = null;
    const busca = (async () => {
      for await (const d of transporte.discover({ timeoutMs, deviceId: alvo.deviceId })) {
        if (d.deviceId === alvo.deviceId) { achado = d; break; }
      }
    })();
    // A busca termina antes de conectar (Android 8/9, status=133).
    await comTimeout(busca.catch(() => undefined), timeoutMs, undefined);
    if (!achado) return 'nao-alcancou';

    sessao = await comTimeout<NodeSession | null>(
      transporte.connect(achado), timeoutMs, null,
    );
    if (!sessao) return 'nao-alcancou';

    const conectada = sessao;
    const grupo = grupoDaReferencia(db, alvo.refId);
    const estado = await acertarRelogio(conectada, agora, timeoutMs, (enviadoMs) => {
      db.transaction(() => {
        gravarReferencia(db, alvo.nodeId, acertoComoReferencia(conectada, enviadoMs, grupo));
        gravarAvaliacao(db, alvo.nodeId, 'confirmacao', enviadoMs);
      });
    });
    return estado === 'acertado' || estado === 'nao-suportado' ? estado : 'falhou';
  } catch {
    return sessao ? 'falhou' : 'nao-alcancou';
  } finally {
    if (sessao) {
      try { await comTimeout(sessao.close(), TIMEOUT_FECHAR_MS, undefined); } catch { /* segue */ }
    }
  }
}
