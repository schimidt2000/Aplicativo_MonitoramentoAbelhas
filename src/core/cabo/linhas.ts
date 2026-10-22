/**
 * As linhas de texto que a placa manda pelo cabo (feature 005). Puro.
 *
 * Protocolo: `COMMUNICATION_PROTOCOL.md`, commit e93f8ad (2026-10-21), e as
 * duas extensões opcionais que o app já aceita (pedidos 1 e 2 ao firmware):
 * `READY:<MAC>` e `FILE_INFO:<tam>:<crc>:<intervalo_s>`.
 *
 * Tudo que não é protocolo é diagnóstico e é ignorado pela conversa (a placa
 * escreve os dois na mesma serial). Alguns diagnósticos viram "pista" — só
 * para escolher a mensagem da tela, NUNCA como contrato: são textos de
 * depuração de outra equipe e podem mudar sem aviso.
 *
 * Uma linha que começa como protocolo e não casa a forma é `ilegivel`: o
 * protocolo mudou ou a linha chegou estragada. A conversa para, sem gravar.
 */

export type CodigoErroDaPlaca =
  | 'BAD_COMMAND' | 'NO_FILE' | 'FILE_OPEN_FAILED' | 'FILE_SEEK_FAILED'
  | 'SIZE_MISMATCH' | 'BAD_CONFIRMATION'
  | 'TIMESTAMP_TIMEOUT' | 'TIMESTAMP_EMPTY' | 'INVALID_TIMESTAMP'
  | 'REMOVE_TEMP_FAILED' | 'TEMP_OPEN_FAILED' | 'TEMP_WRITE_FAILED'
  | 'TEMP_VERIFY_OPEN_FAILED' | 'TEMP_VERIFY_FAILED' | 'REMOVE_BACKUP_FAILED'
  | 'OLD_FILE_RENAME_FAILED' | 'NEW_FILE_RENAME_FAILED' | 'FILE_RESTORE_FAILED'
  | 'BACKUP_CLEANUP_FAILED'
  /** O app manda este; a placa reconhece e desiste (não o manda de volta). */
  | 'CHECKSUM_MISMATCH';

/** Os da tabela do documento + `TIMESTAMP_EMPTY`, que só está no código. */
export const ERROS_DA_PLACA: readonly CodigoErroDaPlaca[] = [
  'BAD_COMMAND', 'NO_FILE', 'FILE_OPEN_FAILED', 'FILE_SEEK_FAILED',
  'SIZE_MISMATCH', 'BAD_CONFIRMATION',
  'TIMESTAMP_TIMEOUT', 'TIMESTAMP_EMPTY', 'INVALID_TIMESTAMP',
  'REMOVE_TEMP_FAILED', 'TEMP_OPEN_FAILED', 'TEMP_WRITE_FAILED',
  'TEMP_VERIFY_OPEN_FAILED', 'TEMP_VERIFY_FAILED', 'REMOVE_BACKUP_FAILED',
  'OLD_FILE_RENAME_FAILED', 'NEW_FILE_RENAME_FAILED', 'FILE_RESTORE_FAILED',
  'BACKUP_CLEANUP_FAILED', 'CHECKSUM_MISMATCH',
];

/** O que um diagnóstico da placa deixa saber. Não é contrato (ver o topo). */
export type PistaDaPlaca =
  /** "Measurement file does not exist." / "Aguardando timestamp inicial do dispositivo..." */
  | 'esperando-hora-inicial'
  /** "Timestamp inicial recebido: <n>" */
  | 'hora-inicial-recebida'
  /** "Timestamp inicial salvo com sucesso!" */
  | 'hora-inicial-salva'
  /** os "ERRO:" do primeiro boot */
  | 'hora-inicial-falhou'
  /** "Aguardando handshake USB..." */
  | 'esperando-handshake'
  /** "Timeout aguardando handshake." */
  | 'desistiu-do-handshake'
  /** "Wake-up causado pelo GPIO." */
  | 'acordou-pelo-botao'
  /** "Wake-up causado pelo timer." / "… motivo desconhecido." — o botão não foi visto */
  | 'acordou-sem-botao';

export type LinhaDaPlaca =
  | { tipo: 'ready'; mac: string | null }
  | { tipo: 'file-info'; tamanho: number; crc: number; intervaloS: number | null }
  | { tipo: 'transfer-ok' }
  | { tipo: 'request-timestamp' }
  | { tipo: 'session-complete' }
  /** `codigo` null: um `ERROR:` que não conhecemos. */
  | { tipo: 'erro'; codigo: CodigoErroDaPlaca | null; texto: string }
  | { tipo: 'ilegivel'; texto: string }
  | { tipo: 'diagnostico'; texto: string; pista: PistaDaPlaca | null; numero: number | null };

const MAC = /^([0-9A-Fa-f]{2})(?:[:-]([0-9A-Fa-f]{2})){5}$/;
const FILE_INFO = /^FILE_INFO:(\d{1,10}):([0-9A-Fa-f]{1,8})(?::([1-9]\d{0,6}))?$/;

/** "aa-bb-cc-dd-ee-ff" → "AA:BB:CC:DD:EE:FF". */
export function normalizarMac(texto: string): string | null {
  if (!MAC.test(texto)) return null;
  return texto.split(/[:-]/).map((p) => p.toUpperCase()).join(':');
}

const FALHAS_DO_PRIMEIRO_BOOT = [
  'ERRO: Falha ao receber o horario do dispositivo!',
  'ERRO: Nenhum dado recebido.',
  'ERRO: Falha ao salvar o timestamp inicial!',
  'ERRO: nao foi possivel abrir o arquivo de medidas!',
  'ERRO: nao foi possivel gravar o timestamp completo!',
];

function pistaDe(l: string): { pista: PistaDaPlaca | null; numero: number | null } {
  const recebido = /^Timestamp inicial recebido: (\d{1,20})$/.exec(l);
  if (recebido) return { pista: 'hora-inicial-recebida', numero: Number(recebido[1]) };
  if (l === 'Measurement file does not exist.' || l.startsWith('Aguardando timestamp inicial')) {
    return { pista: 'esperando-hora-inicial', numero: null };
  }
  if (l === 'Timestamp inicial salvo com sucesso!') return { pista: 'hora-inicial-salva', numero: null };
  if (FALHAS_DO_PRIMEIRO_BOOT.includes(l)) return { pista: 'hora-inicial-falhou', numero: null };
  if (l === 'Aguardando handshake USB...') return { pista: 'esperando-handshake', numero: null };
  if (l === 'Timeout aguardando handshake.') return { pista: 'desistiu-do-handshake', numero: null };
  if (l === 'Wake-up causado pelo GPIO.') return { pista: 'acordou-pelo-botao', numero: null };
  if (l.startsWith('Wake-up causado')) return { pista: 'acordou-sem-botao', numero: null };
  return { pista: null, numero: null };
}

/** Nunca lança. A linha vem sem o LF; espaços e CR nas pontas são retirados, como a placa faz. */
export function lerLinhaDaPlaca(bruta: string): LinhaDaPlaca {
  const l = bruta.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

  if (l === 'READY') return { tipo: 'ready', mac: null };
  if (l.startsWith('READY:')) {
    const mac = normalizarMac(l.slice('READY:'.length));
    return mac ? { tipo: 'ready', mac } : { tipo: 'ilegivel', texto: l };
  }
  if (l === 'FILE_INFO' || l.startsWith('FILE_INFO:')) {
    const m = FILE_INFO.exec(l);
    if (!m) return { tipo: 'ilegivel', texto: l };
    return {
      tipo: 'file-info', tamanho: Number(m[1]), crc: parseInt(m[2], 16) >>> 0,
      intervaloS: m[3] ? Number(m[3]) : null,
    };
  }
  if (l === 'TRANSFER_OK') return { tipo: 'transfer-ok' };
  if (l === 'REQUEST_TIMESTAMP') return { tipo: 'request-timestamp' };
  if (l === 'SESSION_COMPLETE') return { tipo: 'session-complete' };
  if (l.startsWith('ERROR:')) {
    const codigo = l.slice('ERROR:'.length);
    return {
      tipo: 'erro', texto: l,
      codigo: (ERROS_DA_PLACA as readonly string[]).includes(codigo) ? codigo as CodigoErroDaPlaca : null,
    };
  }
  // Começa com um nome de mensagem, mas não é a mensagem: formato mudou.
  if (/^(READY|FILE_INFO|TRANSFER_OK|REQUEST_TIMESTAMP|SESSION_COMPLETE|ERROR)\b/.test(l)) {
    return { tipo: 'ilegivel', texto: l };
  }
  return { tipo: 'diagnostico', texto: l, ...pistaDe(l) };
}
