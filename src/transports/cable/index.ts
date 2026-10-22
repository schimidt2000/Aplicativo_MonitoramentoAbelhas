/**
 * Superfície pública da leitura pelo cabo (feature 004). A tela importa daqui,
 * como o Diagnóstico importa de `@/transports/mock`: a constituição permite
 * que telas de conexão e diagnóstico conheçam o transporte (Princípio IV).
 *
 * Só este pacote olha para o `navigator` em busca da porta serial.
 */
import { Platform } from 'react-native';
import {
  disponibilidadeDoCabo, type AmbienteDoCabo, type DisponibilidadeDoCabo,
} from './disponibilidade';
import type { SerialDoNavegador } from './serial';
import type { SerialDeColeta } from './coleta';

interface NavegadorComSerial {
  serial?: SerialDoNavegador;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
}

function navegador(): NavegadorComSerial | null {
  return typeof navigator === 'undefined' ? null : (navigator as unknown as NavegadorComSerial);
}

export function lerAmbienteDoCabo(): AmbienteDoCabo {
  const nav = navegador();
  return {
    plataforma: Platform.OS,
    temPortaSerial: Boolean(nav?.serial),
    contextoSeguro: typeof window !== 'undefined' && window.isSecureContext === true,
    userAgent: nav?.userAgent ?? '',
    celularPelaDica: nav?.userAgentData?.mobile,
  };
}

export function verificarCabo(): DisponibilidadeDoCabo {
  return disponibilidadeDoCabo(lerAmbienteDoCabo());
}

/** A porta serial do navegador, ou null onde não existe. */
export function serialDoNavegador(): SerialDoNavegador | null {
  if (Platform.OS !== 'web') return null;
  return navegador()?.serial ?? null;
}

/** A mesma porta, com o que a coleta usa a mais (`getPorts`, `connect`). Feature 005. */
export function serialDeColeta(): SerialDeColeta | null {
  return serialDoNavegador() as unknown as SerialDeColeta | null;
}

export { disponibilidadeDoCabo };
export type { AmbienteDoCabo, DisponibilidadeDoCabo, MotivoSemCabo } from './disponibilidade';
export { paraTransportError, type FaseDoCabo } from './erros';
export type { LinhaRecebida } from './linhas';
export {
  abrirLeitura, escolherPorta, SILENCIO_MAXIMO_MS, VELOCIDADE_DA_PLACA,
  type FimDaLeitura, type LeituraAberta, type PortaSerial, type SerialDoNavegador,
} from './serial';
export {
  abrirCanal, aguardarPorta, escolherPortaDeColeta, portaJaAutorizada, vigiarPortas,
  type PortaDeColeta, type SerialDeColeta,
} from './coleta';
