/**
 * "Configurar placa nova" (feature 005, US5, D-513) como máquina de estados
 * pura, irmã de `./protocolo.ts`.
 *
 * Sem arquivo de medições, a placa não conversa: espera, sem prazo, UMA linha
 * com a hora inicial e a converte com `strtoull`, sem validar. Então:
 *  1. o app manda `<segundos>\n` (a tela só deixa com a hora do celular plausível);
 *  2. escuta um pouco. "Timestamp inicial salvo com sucesso!" → confirmada;
 *     um "ERRO:" do primeiro boot → a placa não salvou;
 *  3. sem confirmação, manda `HELLO\n` e escuta mais um pouco: `READY` quer
 *     dizer que a placa JÁ estava configurada (e ignorou a hora). Numa placa
 *     nova, que já tomou a hora, o HELLO não é lido por ninguém.
 *
 * As confirmações são DIAGNÓSTICOS, não contrato: sem elas a tela diz
 * "enviei, mas não deu para confirmar" — nunca afirma sucesso.
 */
import { lerLinhaDaPlaca } from './linhas';

export interface ConfigPlacaNova {
  /** Quanto escutar a confirmação depois de mandar a hora. */
  escutaMs: number;
  /** Quanto escutar o READY depois do HELLO de prova. */
  provaMs: number;
}

export const CONFIG_PLACA_NOVA: ConfigPlacaNova = { escutaMs: 5_000, provaMs: 3_000 };

export type ResultadoPlacaNova =
  | 'confirmada'
  /** Enviada, sem nenhuma confirmação nem sinal de placa já configurada. */
  | 'sem-confirmacao'
  /** A placa respondeu como placa que já mede: a hora foi ignorada. */
  | 'ja-configurada'
  /** A placa disse que não conseguiu salvar a hora. */
  | 'placa-nao-salvou'
  | 'conexao-caiu';

export interface DesfechoPlacaNova {
  resultado: ResultadoPlacaNova;
  horaEnviadaS: number;
  /** A hora que a placa disse ter recebido, se disse. */
  horaRecebidaS: number | null;
}

export type EventoPlacaNova =
  | { tipo: 'comecar'; segundos: number; agora: number }
  | { tipo: 'linha'; texto: string; agora: number }
  | { tipo: 'prazo'; agora: number }
  | { tipo: 'caiu'; agora: number };

export type AcaoPlacaNova =
  | { tipo: 'enviar'; texto: string }
  | { tipo: 'esperar-linha'; ate: number }
  | { tipo: 'terminar'; desfecho: DesfechoPlacaNova };

export interface EstadoPlacaNova {
  fase: 'novo' | 'escutando' | 'provando' | 'fim';
  config: ConfigPlacaNova;
  limite: number;
  horaEnviadaS: number;
  horaRecebidaS: number | null;
}

export function estadoInicialPlacaNova(config: Partial<ConfigPlacaNova> = {}): EstadoPlacaNova {
  return { fase: 'novo', config: { ...CONFIG_PLACA_NOVA, ...config }, limite: 0, horaEnviadaS: 0, horaRecebidaS: null };
}

function fim(e: EstadoPlacaNova, resultado: ResultadoPlacaNova) {
  const desfecho: DesfechoPlacaNova = {
    resultado, horaEnviadaS: e.horaEnviadaS, horaRecebidaS: e.horaRecebidaS,
  };
  return { estado: { ...e, fase: 'fim' as const }, acoes: [{ tipo: 'terminar' as const, desfecho }] };
}

export function passoPlacaNova(
  e: EstadoPlacaNova, ev: EventoPlacaNova,
): { estado: EstadoPlacaNova; acoes: AcaoPlacaNova[] } {
  if (e.fase === 'fim') return { estado: e, acoes: [] };
  if (ev.tipo === 'caiu') return fim(e, 'conexao-caiu');

  if (e.fase === 'novo') {
    if (ev.tipo !== 'comecar' || !Number.isSafeInteger(ev.segundos) || ev.segundos < 0) {
      return fim(e, 'sem-confirmacao');
    }
    const s = { ...e, fase: 'escutando' as const, horaEnviadaS: ev.segundos, limite: ev.agora + e.config.escutaMs };
    return { estado: s, acoes: [{ tipo: 'enviar', texto: `${ev.segundos}\n` }, { tipo: 'esperar-linha', ate: s.limite }] };
  }

  if (ev.tipo === 'prazo') {
    if (e.fase === 'escutando') {
      const s = { ...e, fase: 'provando' as const, limite: ev.agora + e.config.provaMs };
      return { estado: s, acoes: [{ tipo: 'enviar', texto: 'HELLO\n' }, { tipo: 'esperar-linha', ate: s.limite }] };
    }
    return fim(e, 'sem-confirmacao');
  }
  if (ev.tipo !== 'linha') return { estado: e, acoes: [{ tipo: 'esperar-linha', ate: e.limite }] };

  const l = lerLinhaDaPlaca(ev.texto);
  if (l.tipo === 'ready') return fim(e, 'ja-configurada');
  // 4cc7ed8: sem o próprio MAC, a placa não cria o arquivo (e diz isso antes do "ERRO:").
  if (l.tipo === 'erro' && l.codigo === 'MAC_READ_FAILED') return fim(e, 'placa-nao-salvou');
  if (l.tipo === 'diagnostico') {
    if (l.pista === 'hora-inicial-salva') return fim(e, 'confirmada');
    if (l.pista === 'hora-inicial-falhou') return fim(e, 'placa-nao-salvou');
    if (l.pista === 'esperando-handshake' || l.pista === 'acordou-pelo-botao') {
      return fim(e, 'ja-configurada');
    }
    if (l.pista === 'hora-inicial-recebida') {
      return { estado: { ...e, horaRecebidaS: l.numero }, acoes: [{ tipo: 'esperar-linha', ate: e.limite }] };
    }
  }
  return { estado: e, acoes: [{ tipo: 'esperar-linha', ate: e.limite }] };
}
