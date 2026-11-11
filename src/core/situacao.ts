/**
 * A única linha de situação do cartão da colmeia (feature 008, FR-003).
 *
 * O cartão responde a uma pergunta só: "preciso fazer alguma coisa nesta
 * colmeia?". Várias coisas podem estar erradas ao mesmo tempo; mostra-se a mais
 * urgente, e o detalhe da colmeia mostra o resto. A ordem vem da spec:
 * coleta incompleta > trocar bateria agora > coleta muito atrasada > atrasada >
 * bateria acabando > coletar em breve > ainda sem coleta > tudo certo.
 *
 * Função pura: a tela dá a cor, o ícone e a palavra (Princípio V).
 */
import { estadoBateria, nivelColeta } from '@/core/format';

export type Situacao =
  | 'incompleta'
  | 'bateria-agora'
  | 'muito-atrasada'
  | 'atrasada'
  | 'bateria-breve'
  | 'chegando'
  | 'sem-coleta'
  | 'em-dia';

/** Tom da situação: cor e ícone na tela. Dado antigo é ação pendente, não erro. */
export type TomSituacao = 'perigo' | 'atencao' | 'neutro' | 'ok';

export interface EntradaSituacao {
  /** Quando a última coleta terminou (ms UTC); null se nunca houve. */
  coletadaMs: number | null;
  /** Intervalo de coleta escolhido em Ajustes, em dias. */
  intervaloDias: number;
  /** Tensão da bateria do nó em mV; null se o firmware não mandou. */
  battMv: number | null;
  /** Resultado da última coleta desta colmeia; null se nunca houve. */
  ultimoResultado: string | null;
}

export function situacaoDaColmeia(e: EntradaSituacao): Situacao {
  if (e.ultimoResultado !== null && e.ultimoResultado !== 'ok') return 'incompleta';
  const bat = estadoBateria(e.battMv);
  if (bat === 'trocar-agora') return 'bateria-agora';
  const nivel = nivelColeta(e.coletadaMs, e.intervaloDias);
  if (nivel === 'muito-atrasada') return 'muito-atrasada';
  if (nivel === 'atrasada') return 'atrasada';
  if (bat === 'trocar-em-breve') return 'bateria-breve';
  if (nivel === 'chegando') return 'chegando';
  if (nivel === 'sem-coleta') return 'sem-coleta';
  return 'em-dia';
}

export function tomDaSituacao(s: Situacao): TomSituacao {
  switch (s) {
    case 'bateria-agora':
    case 'muito-atrasada':
      return 'perigo';
    case 'incompleta':
    case 'atrasada':
    case 'bateria-breve':
      return 'atencao';
    case 'chegando':
    case 'sem-coleta':
      return 'neutro';
    case 'em-dia':
      return 'ok';
  }
}

/** Precisa ir até a colmeia agora? Conta no cabeçalho do Início (FR-005). */
export function precisaVisita(s: Situacao): boolean {
  return s === 'incompleta' || s === 'bateria-agora' || s === 'muito-atrasada' || s === 'atrasada';
}
