/**
 * Do erro do navegador para `TransportError` com código. Quem decide o texto
 * é `core/bancada/mensagens.ts`, pelo código e pela fase — nunca lendo a
 * mensagem do navegador, que é técnica e em inglês.
 *
 * O que a porta serial do navegador lança (nomes de DOMException):
 *  - ao ESCOLHER a porta: `NotFoundError` quando a pessoa fecha a lista sem
 *    escolher; `SecurityError` quando o navegador ou a política do site não
 *    deixa pedir a porta;
 *  - ao ABRIR: `NetworkError` quando a porta não abre — quase sempre porque
 *    outro programa (o Monitor Serial da IDE do Arduino) está com ela;
 *    `InvalidStateError` quando a porta já está aberta;
 *  - ao LER: `BreakError`, `FramingError`, `ParityError` e
 *    `BufferOverrunError` são NÃO FATAIS (a especificação recria o fluxo e a
 *    leitura continua); `NetworkError` é o cabo que saiu.
 */
import { TransportError, type TransportErrorCode } from '@/core/ports/transport';
import type { FaseDoCabo } from '@/core/bancada/mensagens';

export type { FaseDoCabo };

const NAO_FATAIS = new Set(['BreakError', 'FramingError', 'ParityError', 'BufferOverrunError']);

function nomeDoErro(e: unknown): string {
  if (e && typeof e === 'object' && 'name' in e && typeof (e as { name: unknown }).name === 'string') {
    return (e as { name: string }).name;
  }
  return '';
}

/** Erro de leitura que não derruba a conexão: a porta perdeu ou estragou alguns bytes. */
export function ehErroNaoFatalDeLeitura(e: unknown): boolean {
  return NAO_FATAIS.has(nomeDoErro(e));
}

function codigoPara(nome: string, fase: FaseDoCabo): TransportErrorCode {
  switch (fase) {
    case 'escolher':
      if (nome === 'NotFoundError' || nome === 'AbortError') return 'not-found';
      if (nome === 'SecurityError' || nome === 'NotAllowedError') return 'permission';
      return 'unavailable';
    case 'abrir':
      if (nome === 'SecurityError' || nome === 'NotAllowedError') return 'permission';
      // NetworkError, InvalidStateError e o resto: a porta não ficou disponível.
      return 'unavailable';
    case 'ler':
      return 'connection-lost';
  }
}

/** Sempre devolve TransportError; um TransportError que já veio passa direto. */
export function paraTransportError(e: unknown, fase: FaseDoCabo): TransportError {
  if (e instanceof TransportError) return e;
  const nome = nomeDoErro(e);
  return new TransportError(codigoPara(nome, fase), nome ? `${fase}: ${nome}` : fase);
}
