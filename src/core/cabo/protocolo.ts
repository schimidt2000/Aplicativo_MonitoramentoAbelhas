/**
 * A conversa da coleta pelo cabo, como máquina de estados PURA (feature 005,
 * D-504). Sem porta, sem relógio, sem `await`: cada evento traz `agora`, e cada
 * passo devolve as ações a executar. Quem executa é `./sessao.ts`.
 *
 * Contrato: specs/005-coleta-pelo-cabo/contracts/protocolo-cabo.md.
 *
 *   HELLO → READY[:MAC] → GET_FILE → FILE_INFO:<tam>:<crc>[:<intervalo>]
 *   → <tam> bytes → (gravar) → RECEIVED:<tam>:<CRC> → TRANSFER_OK
 *   → REQUEST_TIMESTAMP → (decidir a hora) → <segundos> → SESSION_COMPLETE
 *
 * Os dois pontos de decisão são ações explícitas:
 *  - `gravar`: só a resposta `gravou` (commit + persist) leva ao RECEIVED. A
 *    placa apaga o arquivo depois da hora, e a hora só vem depois do RECEIVED;
 *    confirmar antes de gravar perderia a coleta numa queda (D-502);
 *  - `decidir-hora`: `null` (hora do celular implausível) encerra sem mandar
 *    nada; a placa desiste em 30 s e NÃO apaga o arquivo.
 *
 * Invariante (INV-504): a placa só pode ter apagado se mandamos a hora, e só
 * mandamos a hora depois de gravar.
 */
import { CRC32_INICIAL, crc32Atualizar, crc32Finalizar, crcEmHex } from './crc32';
import {
  lerLinhaDaPlaca, type CodigoErroDaPlaca, type LinhaDaPlaca, type PistaDaPlaca,
} from './linhas';

export interface ConfigProtocolo {
  /**
   * Quanto escutar ANTES do primeiro HELLO. Uma placa nova toma a primeira
   * linha que chega como hora inicial (`strtoull("HELLO")` = 0): se o boot dela
   * disser que é nova, melhor não mandar nada (FR-025).
   */
  escutaInicialMs: number;
  /** Quanto a placa espera pelo HELLO desde que acordou (30 s no firmware). */
  esperaPelaPlacaMs: number;
  /** Intervalo entre HELLOs enquanto não vem READY (D-506). */
  reenviarHelloMs: number;
  /** Prazo de cada resposta de linha depois do READY. */
  prazoRespostaMs: number;
  /** Silêncio máximo no meio do arquivo. */
  silencioMaximoMs: number;
  /** Maior arquivo aceito (o flash da placa tem 4 MB). */
  tamanhoMaximo: number;
}

export const CONFIG_PADRAO: ConfigProtocolo = {
  escutaInicialMs: 300,
  esperaPelaPlacaMs: 30_000,
  reenviarHelloMs: 4_000,
  prazoRespostaMs: 10_000,
  silencioMaximoMs: 5_000,
  tamanhoMaximo: 8 * 1024 * 1024,
};

/** Até onde a conversa chegou. */
export type Etapa =
  | 'handshake' | 'pedido' | 'arquivo' | 'gravacao' | 'confirmacao'
  | 'pedido-de-hora' | 'hora' | 'concluida';

export type MotivoDoFim =
  | 'concluida'
  /** `ERROR:BACKUP_CLEANUP_FAILED`: o arquivo novo foi instalado; sobrou o backup. */
  | 'concluida-com-aviso'
  /** Nenhum READY no prazo (a placa dormiu, ou não era hora). */
  | 'placa-nao-respondeu'
  /** A placa está esperando a hora inicial: é placa nova (primeiro boot). */
  | 'placa-nova'
  | 'erro-da-placa'
  /** Prazo de uma resposta depois do READY, ou silêncio no meio do arquivo. */
  | 'sem-resposta'
  | 'conexao-caiu'
  | 'crc-diferente'
  /** Linha que parece protocolo e não casa, ordem inesperada, arquivo grande demais. */
  | 'protocolo-desconhecido'
  /** O leitor do arquivo recusou (`arquivo-0` não fecha). Nada gravado. */
  | 'formato-desconhecido'
  /** A gravação no celular falhou. Nada confirmado. */
  | 'nao-gravou'
  /** Hora do celular implausível: a hora não foi enviada. */
  | 'hora-nao-enviada'
  | 'inesperado';

/** O que se sabe do arquivo que está na placa (D-514). */
export type ArquivoNaPlaca = 'apagou' | 'continua' | 'sem-arquivo' | 'nao-se-sabe';

export interface DesfechoDaSessao {
  motivo: MotivoDoFim;
  etapa: Etapa;
  /** O celular gravou o arquivo de forma durável. */
  gravado: boolean;
  arquivoNaPlaca: ArquivoNaPlaca;
  /** O `ERROR:` da placa; 'desconhecido' para um código que não conhecemos. */
  erroDaPlaca: CodigoErroDaPlaca | 'desconhecido' | null;
  mac: string | null;
  intervaloS: number | null;
  tamanho: number | null;
  crc: number | null;
  horaEnviadaS: number | null;
  pistas: PistaDaPlaca[];
  /**
   * Placa nova que tomou o HELLO como hora inicial (a data vira 0). null: ela
   * se mostrou nova depois de um HELLO, e não deu para ver se o tomou.
   */
  tomouHelloComoHora: boolean | null;
}

export interface ArquivoRecebido {
  bytes: Uint8Array;
  tamanho: number;
  crc: number;
  intervaloS: number | null;
  mac: string | null;
}

export type Evento =
  | { tipo: 'comecar'; agora: number }
  | { tipo: 'linha'; texto: string; agora: number }
  | { tipo: 'bytes'; dados: Uint8Array; agora: number }
  /** O prazo da espera atual passou. */
  | { tipo: 'prazo'; agora: number }
  /** A porta sumiu (cabo, placa que dormiu ou reiniciou). */
  | { tipo: 'caiu'; agora: number }
  | { tipo: 'gravou'; agora: number }
  | { tipo: 'nao-gravou'; motivo: 'formato' | 'banco'; agora: number }
  /** A decisão da hora: segundos Unix, ou null para não mandar. */
  | { tipo: 'hora'; segundos: number | null; agora: number };

export type Acao =
  | { tipo: 'enviar'; texto: string }
  /** Esperar a próxima linha até o instante `ate` (ms). */
  | { tipo: 'esperar-linha'; ate: number }
  | { tipo: 'esperar-bytes'; n: number; silencioMs: number }
  | { tipo: 'gravar'; arquivo: ArquivoRecebido }
  | { tipo: 'decidir-hora' }
  | { tipo: 'terminar'; desfecho: DesfechoDaSessao };

type Fase =
  | 'novo' | 'escutando-inicio' | 'aguardando-ready' | 'aguardando-file-info' | 'recebendo' | 'gravando'
  | 'aguardando-transfer-ok' | 'aguardando-pedido-de-hora' | 'decidindo-hora'
  | 'aguardando-fim' | 'fim';

export interface EstadoDoProtocolo {
  fase: Fase;
  config: ConfigProtocolo;
  /** Fim da espera por READY. */
  limiteReady: number;
  proximoHello: number;
  /** Fim da espera de linha atual (depois do READY). */
  limite: number;
  mac: string | null;
  tamanho: number | null;
  crc: number | null;
  intervaloS: number | null;
  gravado: boolean;
  horaEnviadaS: number | null;
  pistas: PistaDaPlaca[];
  tomouHelloComoHora: boolean | null;
  /** A placa se mostrou nova depois de um HELLO: só esperar para ver se o tomou. */
  viuPlacaNova: boolean;
  desfecho: DesfechoDaSessao | null;
}

export interface Passo { estado: EstadoDoProtocolo; acoes: Acao[] }

export function estadoInicial(config: Partial<ConfigProtocolo> = {}): EstadoDoProtocolo {
  return {
    fase: 'novo', config: { ...CONFIG_PADRAO, ...config },
    limiteReady: 0, proximoHello: 0, limite: 0,
    mac: null, tamanho: null, crc: null, intervaloS: null,
    gravado: false, horaEnviadaS: null, pistas: [], tomouHelloComoHora: false,
    viuPlacaNova: false, desfecho: null,
  };
}

const ETAPA_DA_FASE: Record<Fase, Etapa> = {
  'novo': 'handshake',
  'escutando-inicio': 'handshake',
  'aguardando-ready': 'handshake',
  'aguardando-file-info': 'pedido',
  'recebendo': 'arquivo',
  'gravando': 'gravacao',
  'aguardando-transfer-ok': 'confirmacao',
  'aguardando-pedido-de-hora': 'pedido-de-hora',
  'decidindo-hora': 'hora',
  'aguardando-fim': 'hora',
  'fim': 'concluida',
};

/**
 * Erros da placa DEPOIS de ela receber a hora, que deixam o arquivo antigo
 * onde estava (D-514): a troca não chegou a apagar, ou o backup voltou.
 */
const ERROS_QUE_MANTEM_O_ARQUIVO: ReadonlySet<CodigoErroDaPlaca> = new Set<CodigoErroDaPlaca>([
  'TIMESTAMP_TIMEOUT', 'TIMESTAMP_EMPTY', 'INVALID_TIMESTAMP',
  'REMOVE_TEMP_FAILED', 'TEMP_OPEN_FAILED', 'TEMP_WRITE_FAILED',
  'TEMP_VERIFY_OPEN_FAILED', 'TEMP_VERIFY_FAILED', 'REMOVE_BACKUP_FAILED',
  'OLD_FILE_RENAME_FAILED', 'NEW_FILE_RENAME_FAILED',
]);

/**
 * O que se sabe do arquivo da placa ao terminar. Antes de mandarmos a hora a
 * placa não tem como ter apagado: a troca do arquivo só acontece depois dela.
 */
function arquivoAoTerminar(
  e: EstadoDoProtocolo, motivo: MotivoDoFim, erro: CodigoErroDaPlaca | 'desconhecido' | null,
): ArquivoNaPlaca {
  // Placa nova: não há leitura nenhuma a perder. Se tomou o HELLO, ela tem
  // agora um arquivo vazio, com a data 0.
  if (motivo === 'placa-nova') return e.tomouHelloComoHora === true ? 'continua' : 'sem-arquivo';
  if (erro === 'NO_FILE') return 'sem-arquivo';
  if (e.horaEnviadaS === null) return 'continua';
  if (motivo === 'concluida' || motivo === 'concluida-com-aviso') return 'apagou';
  if (erro === 'FILE_RESTORE_FAILED') return 'sem-arquivo';
  if (erro !== null && erro !== 'desconhecido' && ERROS_QUE_MANTEM_O_ARQUIVO.has(erro)) return 'continua';
  return 'nao-se-sabe';
}

function terminar(
  e: EstadoDoProtocolo, motivo: MotivoDoFim, acoes: Acao[] = [],
  erro: CodigoErroDaPlaca | 'desconhecido' | null = null,
): Passo {
  const desfecho: DesfechoDaSessao = {
    motivo,
    etapa: motivo === 'concluida' || motivo === 'concluida-com-aviso' ? 'concluida' : ETAPA_DA_FASE[e.fase],
    gravado: e.gravado,
    arquivoNaPlaca: arquivoAoTerminar(e, motivo, erro),
    erroDaPlaca: erro,
    mac: e.mac,
    intervaloS: e.intervaloS,
    tamanho: e.tamanho,
    crc: e.crc,
    horaEnviadaS: e.horaEnviadaS,
    pistas: [...e.pistas],
    tomouHelloComoHora: e.tomouHelloComoHora,
  };
  return {
    estado: { ...e, fase: 'fim', desfecho },
    acoes: [...acoes, { tipo: 'terminar', desfecho }],
  };
}

const esperarLinha = (e: EstadoDoProtocolo, acoes: Acao[] = []): Passo => ({
  estado: e, acoes: [...acoes, { tipo: 'esperar-linha', ate: e.limite }],
});

/** Depois do READY: cada resposta tem o seu prazo, a contar de agora. */
function proximaResposta(e: EstadoDoProtocolo, fase: Fase, agora: number, acoes: Acao[] = []): Passo {
  return esperarLinha({ ...e, fase, limite: agora + e.config.prazoRespostaMs }, acoes);
}

function comPista(e: EstadoDoProtocolo, l: LinhaDaPlaca): EstadoDoProtocolo {
  if (l.tipo !== 'diagnostico' || l.pista === null || e.pistas.includes(l.pista)) return e;
  return { ...e, pistas: [...e.pistas, l.pista] };
}

const codigoDoErro = (l: Extract<LinhaDaPlaca, { tipo: 'erro' }>) => l.codigo ?? 'desconhecido';

/** O desfecho de uma sessão interrompida por defeito de quem executa (nunca da placa). */
export function desfechoPorDefeito(e: EstadoDoProtocolo): DesfechoDaSessao {
  return terminar(e, 'inesperado').estado.desfecho as DesfechoDaSessao;
}

export function passo(e: EstadoDoProtocolo, ev: Evento): Passo {
  if (e.fase === 'fim') return { estado: e, acoes: [] };

  if (ev.tipo === 'caiu') return terminar(e, 'conexao-caiu');

  switch (e.fase) {
    case 'novo': {
      if (ev.tipo !== 'comecar') break;
      const limiteReady = ev.agora + e.config.esperaPelaPlacaMs;
      const s: EstadoDoProtocolo = {
        ...e, fase: 'escutando-inicio', limiteReady,
        limite: Math.min(limiteReady, ev.agora + e.config.escutaInicialMs),
      };
      return esperarLinha(s);
    }

    case 'escutando-inicio': {
      const helloAgora = (s: EstadoDoProtocolo, agora: number): Passo => {
        const t: EstadoDoProtocolo = {
          ...s, fase: 'aguardando-ready', proximoHello: agora + e.config.reenviarHelloMs,
        };
        return { estado: t, acoes: [
          { tipo: 'enviar', texto: 'HELLO\n' },
          { tipo: 'esperar-linha', ate: Math.min(t.proximoHello, t.limiteReady) },
        ] };
      };
      if (ev.tipo === 'prazo') return helloAgora(e, ev.agora);
      if (ev.tipo !== 'linha') break;
      const l = lerLinhaDaPlaca(ev.texto);
      const s = comPista(e, l);
      if (l.tipo === 'erro') return terminar(s, 'erro-da-placa', [], codigoDoErro(l));
      if (l.tipo === 'diagnostico') {
        // Nenhum HELLO saiu ainda: a placa nova fica intacta.
        if (l.pista === 'esperando-hora-inicial') return terminar({ ...s, tomouHelloComoHora: false }, 'placa-nova');
        if (l.pista === 'desistiu-do-handshake') return terminar(s, 'placa-nao-respondeu');
        // A placa já está ouvindo: não precisa esperar o fim da escuta.
        if (l.pista === 'esperando-handshake') return helloAgora(s, ev.agora);
        return esperarLinha(s);
      }
      return terminar(s, 'protocolo-desconhecido');
    }

    case 'aguardando-ready': {
      const esperar = (s: EstadoDoProtocolo, acoes: Acao[] = []): Passo => ({
        estado: s,
        acoes: [...acoes, {
          tipo: 'esperar-linha',
          ate: s.viuPlacaNova ? s.limite : Math.min(s.proximoHello, s.limiteReady),
        }],
      });
      if (ev.tipo === 'prazo') {
        if (e.viuPlacaNova) return terminar({ ...e, tomouHelloComoHora: null }, 'placa-nova');
        if (ev.agora >= e.limiteReady) return terminar(e, 'placa-nao-respondeu');
        // O primeiro HELLO pode ter saído antes de a serial da placa ouvir (D-506).
        return esperar({ ...e, proximoHello: ev.agora + e.config.reenviarHelloMs },
          [{ tipo: 'enviar', texto: 'HELLO\n' }]);
      }
      if (ev.tipo !== 'linha') break;
      const l = lerLinhaDaPlaca(ev.texto);
      const s = comPista(e, l);
      if (l.tipo === 'ready') {
        return proximaResposta({ ...s, mac: l.mac }, 'aguardando-file-info', ev.agora,
          [{ tipo: 'enviar', texto: 'GET_FILE\n' }]);
      }
      if (l.tipo === 'erro') return terminar(s, 'erro-da-placa', [], codigoDoErro(l));
      if (l.tipo === 'diagnostico') {
        // Placa nova, vista depois do HELLO: nenhum HELLO a mais (ele vira a
        // hora inicial dela); só espera um pouco para ver se ela tomou o que foi.
        if (l.pista === 'esperando-hora-inicial') {
          const t: EstadoDoProtocolo = {
            ...s, viuPlacaNova: true, proximoHello: Number.POSITIVE_INFINITY,
            limite: Math.min(s.limiteReady, ev.agora + 2_000),
          };
          return esperar(t);
        }
        if (l.pista === 'hora-inicial-recebida') {
          return terminar({ ...s, tomouHelloComoHora: true }, 'placa-nova');
        }
        if (l.pista === 'desistiu-do-handshake') return terminar(s, 'placa-nao-respondeu');
        return esperar(s);
      }
      // Antes do READY, outra mensagem de protocolo não tem explicação.
      return terminar(s, 'protocolo-desconhecido');
    }

    case 'aguardando-file-info': {
      if (ev.tipo === 'prazo') return terminar(e, 'sem-resposta');
      if (ev.tipo !== 'linha') break;
      const l = lerLinhaDaPlaca(ev.texto);
      const s = comPista(e, l);
      if (l.tipo === 'diagnostico' || l.tipo === 'ready') return esperarLinha(s);
      if (l.tipo === 'erro') return terminar(s, 'erro-da-placa', [], codigoDoErro(l));
      if (l.tipo !== 'file-info') return terminar(s, 'protocolo-desconhecido');
      const t: EstadoDoProtocolo = { ...s, tamanho: l.tamanho, crc: l.crc, intervaloS: l.intervaloS };
      if (l.tamanho > e.config.tamanhoMaximo) return terminar(t, 'protocolo-desconhecido');
      return {
        estado: { ...t, fase: 'recebendo' },
        acoes: [{ tipo: 'esperar-bytes', n: l.tamanho, silencioMs: e.config.silencioMaximoMs }],
      };
    }

    case 'recebendo': {
      if (ev.tipo === 'prazo') return terminar(e, 'sem-resposta');
      if (ev.tipo !== 'bytes') break;
      const crc = crc32Finalizar(crc32Atualizar(CRC32_INICIAL, ev.dados));
      if (ev.dados.length !== e.tamanho || crc !== e.crc) {
        // O uso documentado: o app avisa a divergência, a placa desiste e
        // fica com o arquivo. Nada foi gravado.
        return terminar(e, 'crc-diferente', [{ tipo: 'enviar', texto: 'ERROR:CHECKSUM_MISMATCH\n' }]);
      }
      return {
        estado: { ...e, fase: 'gravando' },
        acoes: [{ tipo: 'gravar', arquivo: {
          bytes: ev.dados, tamanho: ev.dados.length, crc, intervaloS: e.intervaloS, mac: e.mac,
        } }],
      };
    }

    case 'gravando': {
      if (ev.tipo === 'nao-gravou') {
        // Nem RECEIVED nem aviso: a placa desiste sozinha e fica com o arquivo.
        return terminar(e, ev.motivo === 'formato' ? 'formato-desconhecido' : 'nao-gravou');
      }
      if (ev.tipo !== 'gravou') break;
      return proximaResposta({ ...e, gravado: true }, 'aguardando-transfer-ok', ev.agora, [
        { tipo: 'enviar', texto: `RECEIVED:${e.tamanho}:${crcEmHex(e.crc ?? 0)}\n` },
      ]);
    }

    case 'aguardando-transfer-ok':
    case 'aguardando-pedido-de-hora': {
      if (ev.tipo === 'prazo') return terminar(e, 'sem-resposta');
      if (ev.tipo !== 'linha') break;
      const l = lerLinhaDaPlaca(ev.texto);
      const s = comPista(e, l);
      if (l.tipo === 'diagnostico') return esperarLinha(s);
      if (l.tipo === 'erro') return terminar(s, 'erro-da-placa', [], codigoDoErro(l));
      if (e.fase === 'aguardando-transfer-ok' && l.tipo === 'transfer-ok') {
        return proximaResposta(s, 'aguardando-pedido-de-hora', ev.agora);
      }
      if (e.fase === 'aguardando-pedido-de-hora' && l.tipo === 'request-timestamp') {
        return { estado: { ...s, fase: 'decidindo-hora' }, acoes: [{ tipo: 'decidir-hora' }] };
      }
      return terminar(s, 'protocolo-desconhecido');
    }

    case 'decidindo-hora': {
      if (ev.tipo !== 'hora') break;
      if (ev.segundos === null) return terminar(e, 'hora-nao-enviada');
      if (!Number.isSafeInteger(ev.segundos) || ev.segundos < 0) return terminar(e, 'inesperado');
      return proximaResposta({ ...e, horaEnviadaS: ev.segundos }, 'aguardando-fim', ev.agora, [
        { tipo: 'enviar', texto: `${ev.segundos}\n` },
      ]);
    }

    case 'aguardando-fim': {
      if (ev.tipo === 'prazo') return terminar(e, 'sem-resposta');
      if (ev.tipo !== 'linha') break;
      const l = lerLinhaDaPlaca(ev.texto);
      const s = comPista(e, l);
      if (l.tipo === 'diagnostico') return esperarLinha(s);
      if (l.tipo === 'session-complete') return terminar(s, 'concluida');
      if (l.tipo === 'erro') {
        if (l.codigo === 'BACKUP_CLEANUP_FAILED') {
          return terminar(s, 'concluida-com-aviso', [], 'BACKUP_CLEANUP_FAILED');
        }
        return terminar(s, 'erro-da-placa', [], codigoDoErro(l));
      }
      return terminar(s, 'protocolo-desconhecido');
    }
  }

  // Evento que esta fase não espera: defeito de quem executa, não da placa.
  return terminar(e, 'inesperado');
}
