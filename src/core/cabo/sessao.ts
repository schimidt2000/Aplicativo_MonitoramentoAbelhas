/**
 * Executa as máquinas de estados do cabo sobre uma `CanalSerial` (feature 005).
 * Traduz ação em chamada à porta e o resultado da porta em evento. Nunca lança:
 * todo fim, inclusive um defeito, vira um desfecho.
 *
 * Também guarda o registro da conversa (só as linhas de texto, sem o binário),
 * que vai para a sessão no banco: é o que levar ao grupo do firmware quando algo
 * der errado (FR-007).
 */
import { LeituraIncompletaError, type CanalSerial } from '../ports/canal';
import { TransportError } from '../ports/transport';
import {
  desfechoPorDefeito, estadoInicial, passo, type ArquivoRecebido, type ConfigProtocolo, type DesfechoDaSessao,
  type Evento,
} from './protocolo';
import {
  estadoInicialPlacaNova, passoPlacaNova, type ConfigPlacaNova, type DesfechoPlacaNova,
  type EventoPlacaNova,
} from './placaNova';

/** O registro guardado na sessão tem teto (data-model: 16 KB). */
export const REGISTRO_MAXIMO = 16 * 1024;

export type ProgressoDaSessao =
  | { fase: 'conversando' }
  | { fase: 'recebendo'; recebidos: number; total: number }
  | { fase: 'gravando' }
  | { fase: 'confirmando' }
  | { fase: 'recomecando' };

export interface DecisoesDaSessao {
  /**
   * Grava o arquivo de forma DURÁVEL (commit + persist). Só `ok: true` libera o
   * RECEIVED. Não deve lançar; se lançar, conta como gravação que falhou.
   */
  gravar(arquivo: ArquivoRecebido): Promise<{ ok: true } | { ok: false; motivo: 'formato' | 'banco' }>;
  /** Os segundos Unix a mandar, ou null se a hora do celular é implausível. */
  horaParaEnviar(): number | null;
}

/**
 * Relógio da CONVERSA: monotônico, só para prazos. Nunca o relógio do celular,
 * que pode saltar no meio (acerto automático, a pessoa mexendo na data) e
 * esticar ou encurtar um prazo de 30 s.
 */
export function relogioMonotonico(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
}

export interface OpcoesDaSessao {
  /** Relógio dos prazos. Padrão: monotônico. */
  agora?: () => number;
  config?: Partial<ConfigProtocolo>;
  aoMudar?: (p: ProgressoDaSessao) => void;
}

export interface ResultadoDaSessao {
  desfecho: DesfechoDaSessao;
  registro: string;
  /** O arquivo como chegou — inteiro, ou o pedaço que chegou antes da queda. */
  bruto: Uint8Array | null;
}

class Registro {
  private partes: string[] = [];
  private tamanho = 0;
  private cortado = false;

  constructor(private readonly agora: () => number, private readonly inicio: number) {}

  anotar(direcao: '→' | '←' | '·', texto: string) {
    if (this.cortado) return;
    const linha = `+${((this.agora() - this.inicio) / 1000).toFixed(3)}s ${direcao} ${texto}`;
    if (this.tamanho + linha.length + 1 > REGISTRO_MAXIMO) {
      this.partes.push('…');
      this.cortado = true;
      return;
    }
    this.partes.push(linha);
    this.tamanho += linha.length + 1;
  }

  texto() { return this.partes.join('\n'); }
}

const visivel = (t: string) => t.replace(/\n$/, '').replace(/[\x00-\x1f\x7f]/g, '·');

function eventoDeErro(e: unknown, agora: number): { tipo: 'prazo' | 'caiu'; agora: number } {
  if (e instanceof TransportError && e.code === 'timeout') return { tipo: 'prazo', agora };
  return { tipo: 'caiu', agora };
}

/** A coleta. */
export async function executarSessao(
  canal: CanalSerial, decisoes: DecisoesDaSessao, opcoes: OpcoesDaSessao = {},
): Promise<ResultadoDaSessao> {
  const agora = opcoes.agora ?? relogioMonotonico;
  const avisar = (p: ProgressoDaSessao) => { try { opcoes.aoMudar?.(p); } catch { /* a tela não para a coleta */ } };
  const registro = new Registro(agora, agora());
  let bruto: Uint8Array | null = null;

  let estado = estadoInicial(opcoes.config);
  let ev: Evento = { tipo: 'comecar', agora: agora() };
  avisar({ fase: 'conversando' });

  try {
    for (;;) {
      const r = passo(estado, ev);
      estado = r.estado;
      let proximo: Evento | null = null;
      for (const a of r.acoes) {
        if (a.tipo === 'terminar') {
          registro.anotar('·', `fim: ${a.desfecho.motivo}`);
          return { desfecho: a.desfecho, registro: registro.texto(), bruto };
        }
        if (a.tipo === 'enviar') {
          registro.anotar('→', visivel(a.texto));
          if (a.texto.startsWith('RECEIVED:')) avisar({ fase: 'confirmando' });
          if (/^\d+\n$/.test(a.texto)) avisar({ fase: 'recomecando' });
          try {
            await canal.escrever(a.texto);
          } catch (e) {
            proximo = eventoDeErro(e, agora());
            break;
          }
          continue;
        }
        if (a.tipo === 'esperar-linha') {
          try {
            const texto = await canal.lerLinha(Math.max(0, a.ate - agora()));
            registro.anotar('←', visivel(texto));
            proximo = { tipo: 'linha', texto, agora: agora() };
          } catch (e) {
            proximo = eventoDeErro(e, agora());
          }
        } else if (a.tipo === 'esperar-bytes') {
          avisar({ fase: 'recebendo', recebidos: 0, total: a.n });
          try {
            bruto = await canal.lerBytes(a.n, a.silencioMs,
              (recebidos) => avisar({ fase: 'recebendo', recebidos, total: a.n }));
            registro.anotar('←', `[arquivo: ${bruto.length} bytes]`);
            proximo = { tipo: 'bytes', dados: bruto, agora: agora() };
          } catch (e) {
            if (e instanceof LeituraIncompletaError) bruto = e.parcial;
            registro.anotar('·', `[arquivo interrompido: ${bruto?.length ?? 0} de ${a.n} bytes]`);
            proximo = eventoDeErro(e, agora());
          }
        } else if (a.tipo === 'gravar') {
          avisar({ fase: 'gravando' });
          let g: Awaited<ReturnType<DecisoesDaSessao['gravar']>>;
          try {
            g = await decisoes.gravar(a.arquivo);
          } catch {
            g = { ok: false, motivo: 'banco' };
          }
          registro.anotar('·', g.ok ? 'gravado no celular' : `não gravado (${g.motivo})`);
          proximo = g.ok ? { tipo: 'gravou', agora: agora() } : { tipo: 'nao-gravou', motivo: g.motivo, agora: agora() };
        } else if (a.tipo === 'decidir-hora') {
          let segundos: number | null;
          try { segundos = decisoes.horaParaEnviar(); } catch { segundos = null; }
          if (segundos === null) registro.anotar('·', 'hora do celular implausível: não enviada');
          proximo = { tipo: 'hora', segundos, agora: agora() };
        }
        break;
      }
      if (proximo === null) {
        // Nenhuma espera depois dos envios: a máquina não pode parar assim.
        proximo = { tipo: 'caiu', agora: agora() };
      }
      ev = proximo;
    }
  } catch {
    registro.anotar('·', 'fim: inesperado');
    return { desfecho: desfechoPorDefeito(estado), registro: registro.texto(), bruto };
  }
}

export interface OpcoesPlacaNova {
  agora?: () => number;
  config?: Partial<ConfigPlacaNova>;
}

/** Configurar placa nova. */
export async function executarPlacaNova(
  canal: CanalSerial, segundos: number, opcoes: OpcoesPlacaNova = {},
): Promise<{ desfecho: DesfechoPlacaNova; registro: string }> {
  const agora = opcoes.agora ?? relogioMonotonico;
  const registro = new Registro(agora, agora());
  let estado = estadoInicialPlacaNova(opcoes.config);
  let ev: EventoPlacaNova = { tipo: 'comecar', segundos, agora: agora() };
  for (;;) {
    const r = passoPlacaNova(estado, ev);
    estado = r.estado;
    let proximo: EventoPlacaNova | null = null;
    for (const a of r.acoes) {
      if (a.tipo === 'terminar') {
        registro.anotar('·', `fim: ${a.desfecho.resultado}`);
        return { desfecho: a.desfecho, registro: registro.texto() };
      }
      if (a.tipo === 'enviar') {
        registro.anotar('→', visivel(a.texto));
        try { await canal.escrever(a.texto); } catch (e) { proximo = eventoDeErro(e, agora()); break; }
        continue;
      }
      try {
        const texto = await canal.lerLinha(Math.max(0, a.ate - agora()));
        registro.anotar('←', visivel(texto));
        proximo = { tipo: 'linha', texto, agora: agora() };
      } catch (e) {
        proximo = eventoDeErro(e, agora());
      }
      break;
    }
    ev = proximo ?? { tipo: 'caiu', agora: agora() };
  }
}
