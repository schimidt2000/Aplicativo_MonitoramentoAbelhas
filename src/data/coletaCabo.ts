/**
 * A coleta pelo cabo, de ponta a ponta, e NUNCA lança (feature 005). Irmã de
 * `./coleta.ts`: a mesma ingestão, a mesma hora (VIEW `leitura_hora`), o mesmo
 * resultado (`ResultadoColeta`) e as mesmas mensagens — só a conversa é outra.
 *
 * O ponto que importa (D-502): a placa APAGA o arquivo depois de receber a
 * hora, e a hora só vai depois do RECEIVED. Então `gravar` faz, numa transação
 * só, a sessão com o arquivo bruto, as leituras, a referência de hora e a
 * avaliação das horas; depois `persist()` (no navegador, o IndexedDB). Só com
 * as duas coisas a conversa recebe "gravou" e manda o RECEIVED.
 *
 * Esta camada só conhece a porta `CanalSerial`: quem abre a porta de verdade
 * (Web Serial) ou a placa simulada é a tela, por `src/transports/`.
 */
import type { CanalSerial } from '@/core/ports/canal';
import { executarSessao, type ProgressoDaSessao } from '@/core/cabo/sessao';
import type { ArquivoRecebido, ConfigProtocolo, DesfechoDaSessao } from '@/core/cabo/protocolo';
import { outcomeDoDesfecho, problemaDoDesfecho, relogioDoDesfecho } from '@/core/cabo/resultado';
import { crcEmHex } from '@/core/cabo/crc32';
import {
  FORMATO_DE_ARQUIVO_ATUAL, PROTO_VER_DO_FORMATO, lerArquivo, seqDaMedicao, type ArquivoLido,
} from '@/core/decode/arquivo';
import { INTERVALO_PADRAO_S, type ConferenciaDaContagem } from '@/core/hora';
import { avaliarRelogioDoCelular } from '@/core/relogio';
import type { ResultadoColeta, ResultadoNo } from '@/core/coleta/resultado';
import { ingerirLoteSemTransacao } from './ingest';
import { gravarAvaliacao, gravarReferencia, intervaloDaPlacaOuPadrao } from './hora';
import {
  CHAVE_ULTIMA_COLMEIA_DO_CABO, gravarConfig, noDaColmeia, noDaPlaca, nomeDaColmeia,
  ultimaAncoraConfiavelMs,
} from './repo';
import type { SqlDb } from './types';

export interface OpcoesColetaCabo {
  /** A resposta de "De qual colmeia é esta placa?". */
  hiveId: string;
  /** Relógio do celular (hora das referências e da hora enviada). Injetável para teste. */
  agora?: () => number;
  config?: Partial<ConfigProtocolo>;
  aoProgredir?: (p: ProgressoDaSessao) => void;
  /** `cable` (placa real) ou `mock` (placa simulada). Fica em cada leitura. */
  src?: 'cable' | 'mock';
}

interface Gravado {
  nodeId: number;
  deviceId: string;
  hiveId: string;
  peloMac: boolean;
  sessaoId: number;
  refId: number;
  arquivo: ArquivoLido;
  inseridas: number;
  /** Leituras com a chave de outra já gravada e conteúdo diferente: não entraram (D-519). */
  conflitos: number;
  conferencia: ConferenciaDaContagem | null;
  /** A referência confiável mais recente ANTES desta coleta: pega o relógio que voltou. */
  ultimaAntesMs: number | null;
}

const PREFIXO_SEM_NO = 'colmeia:';

export async function coletarPeloCabo(
  db: SqlDb, canal: CanalSerial, opts: OpcoesColetaCabo,
): Promise<ResultadoColeta> {
  const agora = opts.agora ?? Date.now;
  const src = opts.src ?? 'cable';
  const inicio = agora();
  const vazio: ResultadoColeta = { nos: [], desconhecidos: [], geral: null };

  let nomeEscolhida: string | null;
  try {
    nomeEscolhida = nomeDaColmeia(db, opts.hiveId);
    // A escolha fica para a próxima vez (FR-020), mesmo que a coleta falhe.
    gravarConfig(db, CHAVE_ULTIMA_COLMEIA_DO_CABO, opts.hiveId);
  } catch {
    await canal.fechar();
    return { ...vazio, geral: 'inesperado' };
  }
  if (nomeEscolhida === null) {
    await canal.fechar();
    return { ...vazio, geral: 'inesperado' };
  }

  let gravado: Gravado | null = null;
  let semFormato: { nodeId: number } | null = null;

  const gravar = async (a: ArquivoRecebido): Promise<{ ok: true } | { ok: false; motivo: 'formato' | 'banco' }> => {
    const tc = agora();
    let arquivo: ArquivoLido;
    try {
      arquivo = lerArquivo(FORMATO_DE_ARQUIVO_ATUAL, a.bytes);
    } catch {
      // Nunca adivinhar o formato. Nada parcial vai para `reading`; o bruto fica
      // guardado na sessão, para ler quando o leitor novo existir (FR-007).
      try {
        db.transaction(() => {
          const no = noDaPlaca(db, opts.hiveId, a.mac);
          semFormato = { nodeId: no.nodeId };
        });
      } catch { /* o desfecho já diz que nada foi gravado */ }
      return { ok: false, motivo: 'formato' };
    }
    // O MAC que vale: o de dentro do arquivo (4cc7ed8); senão, o do READY:<MAC>.
    const mac = arquivo.mac ?? a.mac;
    try {
      let g: Gravado | null = null;
      db.transaction(() => {
        const no = noDaPlaca(db, opts.hiveId, mac);
        const ultimaAntesMs = ultimaAncoraConfiavelMs(db, no.nodeId);
        db.run(
          `INSERT INTO pull_session
             (node_id, started_ms, proto_ver, raw, record_count, outcome, src, formato, crc32)
           VALUES (?, ?, ?, ?, ?, 'gravado', ?, ?, ?)`,
          [no.nodeId, inicio, arquivo.protoVer, a.bytes, arquivo.leituras.length, src,
            arquivo.formato, crcEmHex(a.crc)],
        );
        const sessaoId = db.all<{ id: number }>('SELECT last_insert_rowid() AS id')[0].id;
        // Antes do INSERT OR IGNORE: a mesma chave com conteúdo diferente não é
        // reimportação, é colisão, e o IGNORE a engoliria calada (D-519).
        const conflitos = contarConflitosDeChave(db, no.nodeId, arquivo.leituras);
        const r = ingerirLoteSemTransacao(
          db, no.nodeId, arquivo.leituras, { clockMode: 'contagem' }, arquivo.protoVer, src,
        );
        const n = arquivo.leituras.length;
        // A referência de hora desta coleta: a hora do celular quando o arquivo
        // chegou, e quantas medições ele tinha. É ela que confere a conta (FR-017).
        const refId = gravarReferencia(db, no.nodeId, {
          origem: 'coleta', bootId: null, ligada: null,
          tNode: Math.max(0, n - 1), tUtcMs: tc, monoMs: 0, rttMs: 0, src,
          aceita: avaliarRelogioDoCelular(tc, ultimaAntesMs).plausivel,
          seqRef: n > 0 ? seqDaMedicao(arquivo.inicioS, n - 1) : null,
          modo: 'contagem', periodoS: a.intervaloS, criadoMs: tc,
        });
        const { avaliacao } = gravarAvaliacao(db, no.nodeId, 'coleta', tc);
        g = {
          nodeId: no.nodeId, deviceId: no.deviceId, hiveId: no.hiveId, peloMac: no.peloMac,
          sessaoId, refId, arquivo, inseridas: r.inseridas, conflitos,
          conferencia: avaliacao.contagens.find((c) => c.refId === refId) ?? null,
          ultimaAntesMs,
        };
      });
      // Sem isto, no navegador, tudo ainda está só na memória da aba.
      await db.persist();
      gravado = g;
      return { ok: true };
    } catch {
      return { ok: false, motivo: 'banco' };
    }
  };

  const horaParaEnviar = (): number | null => {
    const g = gravado as Gravado | null;
    if (!g) return null;
    // Antes do início do projeto, ou antes de uma referência que já valia: a
    // hora não vai, e a placa fica com o arquivo (FR-010).
    const agoraMs = agora();
    return avaliarRelogioDoCelular(agoraMs, g.ultimaAntesMs).plausivel ? Math.floor(agoraMs / 1000) : null;
  };

  // Os prazos da conversa correm no relógio monotônico; `agora` (o do
  // celular) só entra na hora das referências e na hora enviada à placa.
  const sessao = await executarSessao(canal, { gravar, horaParaEnviar }, {
    config: opts.config, aoMudar: opts.aoProgredir,
  });
  await canal.fechar();
  const d = sessao.desfecho;
  const g = gravado as Gravado | null;

  /* ---------- Depois da conversa: escrituração, sem nunca lançar ---------- */
  try {
    db.transaction(() => {
      let registro = sessao.registro;
      if (g && g.arquivo.numeracaoComecaEm === 1) {
        registro += '\n· a placa numerou as medições a partir de 1 (defeito conhecido do firmware 4cc7ed8): a hora usa a posição no arquivo';
      }
      if (g && g.conflitos > 0) {
        registro += `\n· ${g.conflitos} leituras com a chave de outras já gravadas, com conteúdo diferente: fora da série, no bruto desta sessão`;
      }
      const comum = [agora(), outcomeDoDesfecho(d), d.arquivoNaPlaca, d.erroDaPlaca, d.horaEnviadaS, registro];
      if (g) {
        db.run(
          `UPDATE pull_session SET ended_ms = ?, outcome = ?, fim_da_placa = ?, erro_da_placa = ?,
                  hora_enviada_s = ?, registro = ? WHERE id = ?`,
          [...comum, g.sessaoId],
        );
        // A placa recomeçou com a nossa hora: é o início do próximo arquivo.
        if (d.horaEnviadaS !== null && d.arquivoNaPlaca === 'apagou') {
          gravarReferencia(db, g.nodeId, {
            origem: 'acerto', grupo: g.refId, bootId: null, ligada: null, tNode: 0,
            tUtcMs: d.horaEnviadaS * 1000, monoMs: 0, rttMs: 0, src, aceita: true,
            seqRef: null, modo: 'contagem', periodoS: d.intervaloS, criadoMs: agora(),
          });
        }
      } else {
        // Sessão sem gravação: registrada se houver nó (ou bytes a guardar).
        const existente = semFormato ?? noDaColmeia(db, opts.hiveId);
        const bruto = sessao.bruto && sessao.bruto.length > 0 ? sessao.bruto : null;
        const nodeId = existente?.nodeId ?? (bruto ? noDaPlaca(db, opts.hiveId, d.mac).nodeId : null);
        if (nodeId !== null) {
          db.run(
            `INSERT INTO pull_session
               (node_id, started_ms, ended_ms, proto_ver, raw, record_count, outcome, src, formato,
                crc32, fim_da_placa, erro_da_placa, hora_enviada_s, registro)
             VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nodeId, inicio, comum[0], bruto, comum[1], src, FORMATO_DE_ARQUIVO_ATUAL,
              d.crc === null ? null : crcEmHex(d.crc), comum[2], comum[3], comum[4], comum[5]],
          );
        }
      }
    });
    await db.persist();
  } catch { /* escrituração: as leituras, se houve, já estavam duráveis */ }

  return { nos: [montarNo(db, opts.hiveId, nomeEscolhida, d, g, src)], desconhecidos: [], geral: null };
}

function montarNo(
  db: SqlDb, hiveIdEscolhida: string, nomeEscolhida: string, d: DesfechoDaSessao,
  g: Gravado | null, src: string,
): ResultadoNo {
  let nome = nomeEscolhida;
  let deviceId = `${PREFIXO_SEM_NO}${hiveIdEscolhida}`;
  let semHora = 0;
  let periodo: { deMs: number; ateMs: number } | null = null;
  let intervaloS = INTERVALO_PADRAO_S;
  if (g) {
    deviceId = g.deviceId;
    try {
      if (g.peloMac) nome = nomeDaColmeia(db, g.hiveId) ?? nome;
      intervaloS = g.conferencia?.intervaloS ?? intervaloDaPlacaOuPadrao(db, g.nodeId, INTERVALO_PADRAO_S);
      const n = g.arquivo.leituras.length;
      if (n > 0) {
        const de = g.arquivo.leituras[0].seq;
        const ate = g.arquivo.leituras[n - 1].seq;
        const r = db.all<{ sem: number; de: number | null; ate: number | null }>(
          `SELECT SUM(CASE WHEN t_utc_ms IS NULL THEN 1 ELSE 0 END) AS sem,
                  MIN(t_utc_ms) AS de, MAX(t_utc_ms) AS ate
             FROM leitura_hora WHERE node_id = ? AND seq BETWEEN ? AND ?`,
          [g.nodeId, de, ate],
        )[0];
        semHora = r?.sem ?? 0;
        if (r && r.de !== null && r.ate !== null) periodo = { deMs: r.de, ateMs: r.ate };
      }
    } catch { /* o resultado sai sem os detalhes de hora */ }
  }
  const recebidas = g ? g.arquivo.leituras.length : 0;
  return {
    deviceId, nome,
    inseridas: g?.inseridas ?? 0,
    recebidas,
    dias: Math.round((recebidas * intervaloS) / 86400),
    problema: problemaDoDesfecho(d),
    relogio: relogioDoDesfecho(d),
    cabo: {
      desfecho: d, conferencia: g?.conferencia ?? null, semHora, periodo,
      colmeiaPeloMac: g?.peloMac ?? false, simulada: src === 'mock', conflitos: g?.conflitos ?? 0,
    },
  };
}

/**
 * Quantas leituras do arquivo têm a chave `(nó, seq)` de uma já gravada, mas
 * conteúdo diferente (D-519). Reimportar o mesmo arquivo dá zero: o conteúdo é
 * o mesmo, e o INSERT OR IGNORE não faz nada, como deve. Colisão de verdade só
 * acontece quando dois arquivos do mesmo nó têm a mesma hora de início — na
 * prática, placa nova que tomou o HELLO como data 0 duas vezes. Essas leituras
 * ficam fora da série (a gravada não muda: Princípio III), mas não se perdem:
 * estão no bruto da sessão, que a mesma transação guarda.
 */
function contarConflitosDeChave(db: SqlDb, nodeId: number, leituras: ArquivoLido['leituras']): number {
  if (leituras.length === 0) return 0;
  const existentes = db.all<{
    seq: number; t_node: number | null; temp_bruto: number | null; rh_bruto: number | null;
    tvoc_ppb: number | null; eco2_ppm: number | null; flags: number;
  }>(
    `SELECT seq, t_node, temp_bruto, rh_bruto, tvoc_ppb, eco2_ppm, flags
       FROM reading WHERE node_id = ? AND seq BETWEEN ? AND ?`,
    [nodeId, leituras[0].seq, leituras[leituras.length - 1].seq],
  );
  if (existentes.length === 0) return 0;
  const porSeq = new Map(existentes.map((e) => [e.seq, e]));
  let n = 0;
  for (const l of leituras) {
    const e = porSeq.get(l.seq);
    if (!e) continue;
    const igual = e.t_node === l.tNode && e.temp_bruto === (l.tempBruto ?? null)
      && e.rh_bruto === (l.rhBruto ?? null) && e.tvoc_ppb === l.tvocPpb
      && e.eco2_ppm === l.eco2Ppm && e.flags === l.flags;
    if (!igual) n++;
  }
  return n;
}
