/**
 * O cabo pela porta USB do próprio aparelho Android (feature 006). Fala com o
 * módulo nativo `modules/bee-usb-serial` e entrega à conversa a mesma
 * `CanalSerial` da 005, sobre a mesma `EntradaDeBytes`. Só este arquivo importa
 * o módulo (Princípio IV, check-fronteira).
 *
 * A placa que acorda aparece no USB como um aparelho novo, e a licença de USB do
 * Android vale por aparelho: por isso a licença é pedida em `abrir`, que sempre
 * vem do toque em Coletar ou Acertar o relógio (FR-003, D-605). A placa que
 * aparece e some é vista por consulta à lista, a cada segundo (D-604).
 */
import { TransportError, type TransportErrorCode } from '@/core/ports/transport';
import type { ModuloUsbSerial, PlacaUsb } from '../../../modules/bee-usb-serial';
import { deBase64, paraBase64 } from './base64';
import type { CaboDeColeta, PortaDoCabo } from './cabo';
import { EntradaDeBytes, canalSobre } from './entrada';

interface PortaAndroid { nome: string }

export interface OpcoesCaboAndroid {
  /** De quanto em quanto tempo olhar se a placa apareceu ou sumiu. */
  intervaloMs?: number;
}

/** O código do erro nativo (CodedException) → o código do transporte. */
function codigoDoErro(e: unknown): TransportErrorCode {
  const c = (e as { code?: string } | null)?.code;
  if (c === 'ERR_SEM_PERMISSAO') return 'permission';
  if (c === 'ERR_SEM_PLACA') return 'not-found';
  if (c === 'ERR_CAIU' || c === 'ERR_FECHADA') return 'connection-lost';
  return 'unavailable';
}

export function caboDoAparelho(m: ModuloUsbSerial, o: OpcoesCaboAndroid = {}): CaboDeColeta {
  const placas = (): PlacaUsb[] => {
    try { return m.listar(); } catch { return []; }
  };
  // O mesmo objeto enquanto a placa está ligada: a tela compara por identidade.
  let vista: PortaAndroid | null = null;
  const primeira = (): PortaAndroid | null => {
    const p = placas()[0];
    if (!p) return null;
    if (vista?.nome !== p.nome) vista = { nome: p.nome };
    return vista;
  };

  return {
    origem: 'aparelho',

    async portaJaAutorizada() {
      return primeira();
    },

    vigiar(aoAparecer, aoSumir) {
      let atual = primeira();
      const id = setInterval(() => {
        const agora = primeira();
        if (agora === atual) return;
        const antes = atual;
        atual = agora;
        try {
          if (antes) aoSumir?.(antes);
          if (agora) aoAparecer(agora);
        } catch { /* a tela segue */ }
      }, o.intervaloMs ?? 1000);
      return () => clearInterval(id);
    },

    async escolher(): Promise<PortaDoCabo> {
      const p = primeira();
      if (!p) throw new TransportError('not-found', 'nenhuma placa no cabo');
      return p;
    },

    async abrir(porta) {
      // A placa pode ter dormido e voltado com outro nome: vale a que está ligada agora.
      const lista = placas();
      const alvo = lista.find((x) => x.nome === (porta as PortaAndroid).nome) ?? lista[0];
      if (!alvo) throw new TransportError('not-found', 'a placa não está ligada');
      if (!alvo.permitida) {
        let ok = false;
        try { ok = await m.pedirPermissao(alvo.nome); } catch { ok = false; }
        if (!ok) throw new TransportError('permission', 'o Android não deixou usar a placa');
      }

      // Os eventos podem chegar antes de a alça voltar: guarda até saber qual é a nossa.
      const entrada = new EntradaDeBytes();
      let alca: number | null = null;
      const antes: Array<{ alca: number; b64: string }> = [];
      let fimAntes: number | null = null;
      const dados = m.addListener('onDados', (ev) => {
        if (alca === null) { antes.push(ev); return; }
        if (ev.alca === alca) entrada.empurrar(deBase64(ev.b64));
      });
      const fim = m.addListener('onFim', (ev) => {
        if (alca === null) { fimAntes = ev.alca; return; }
        if (ev.alca !== alca) return;
        limpar();
        entrada.encerrar(new TransportError('connection-lost', `a placa sumiu (${ev.motivo})`));
      });
      const limpar = () => {
        try { dados.remove(); } catch { /* já removido */ }
        try { fim.remove(); } catch { /* já removido */ }
      };

      try {
        alca = await m.abrir(alvo.nome);
      } catch (e) {
        limpar();
        throw new TransportError(codigoDoErro(e), 'abrir');
      }
      for (const ev of antes) if (ev.alca === alca) entrada.empurrar(deBase64(ev.b64));
      if (fimAntes === alca) {
        limpar();
        entrada.encerrar(new TransportError('connection-lost', 'a placa sumiu ao abrir'));
      }
      const minha = alca;

      const escrever = async (bytes: Uint8Array) => {
        try {
          await m.escrever(minha, paraBase64(bytes));
        } catch {
          throw new TransportError('connection-lost', 'escrever');
        }
      };
      let solta = false;
      const soltar = async () => {
        if (solta) return;
        solta = true;
        limpar();
        try { await m.fechar(minha); } catch { /* a placa pode já ter sumido */ }
        entrada.encerrar(new TransportError('connection-lost', 'porta fechada pelo app'));
      };
      return canalSobre(entrada, escrever, soltar);
    },
  };
}
