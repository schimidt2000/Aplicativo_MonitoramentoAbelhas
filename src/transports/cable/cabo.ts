/**
 * O cabo da coleta, visto pelas telas (feature 006). Duas versões com a mesma
 * cara: a porta serial do navegador (Web Serial, feature 005) e a porta USB do
 * próprio aparelho Android (`./android.ts`). A conversa com a placa não sabe
 * qual está em uso: ela só vê a `CanalSerial` que `abrir` devolve.
 */
import type { CanalSerial } from '@/core/ports/canal';
import {
  abrirCanal, escolherPortaDeColeta, portaJaAutorizada, vigiarPortas,
  type PortaDeColeta, type SerialDeColeta,
} from './coleta';

/** A placa como a tela a conhece: só se guarda e se devolve. */
export type PortaDoCabo = object;

export interface CaboDeColeta {
  /**
   * `navegador`: a pessoa escolhe a placa numa lista e libera o endereço.
   * `aparelho`: o Android acha a placa sozinho e pede licença de USB.
   */
  readonly origem: 'navegador' | 'aparelho';
  /** Uma placa ligada agora (acordada), ou null. */
  portaJaAutorizada(): Promise<PortaDoCabo | null>;
  /** Avisa quando a placa aparece (acordou) e some (dormiu). Devolve o "parar". */
  vigiar(aoAparecer: (p: PortaDoCabo) => void, aoSumir?: (p: PortaDoCabo) => void): () => void;
  /** Tem de ser chamada direto do toque. Lança TransportError. */
  escolher(): Promise<PortaDoCabo>;
  /** Abre a placa (pedindo licença, se for o caso) e devolve a conversa. Lança TransportError. */
  abrir(p: PortaDoCabo): Promise<CanalSerial>;
}

/** A versão do navegador: embrulha as funções da 005, sem mudar nada nelas. */
export function caboDoNavegador(serial: SerialDeColeta): CaboDeColeta {
  return {
    origem: 'navegador',
    portaJaAutorizada: () => portaJaAutorizada(serial),
    vigiar: (aoAparecer, aoSumir) => vigiarPortas(serial, aoAparecer, aoSumir),
    escolher: () => escolherPortaDeColeta(serial),
    abrir: (p) => abrirCanal(p as PortaDeColeta),
  };
}
