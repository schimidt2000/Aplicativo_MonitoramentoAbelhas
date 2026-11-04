/**
 * A porta serial USB do próprio aparelho Android (feature 006). Só
 * `src/transports/cable/android.ts` importa daqui (Princípio IV, check-fronteira).
 *
 * `null` onde o módulo não existe: no navegador, no iOS e no Expo Go, que não
 * carrega módulo nativo próprio. A tela então explica o caminho (FR-008).
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface PlacaUsb {
  /** Nome do aparelho no Android (muda a cada vez que a placa reaparece). */
  nome: string;
  vid: number;
  pid: number;
  permitida: boolean;
}

export interface Assinatura { remove(): void }

export interface ModuloUsbSerial {
  listar(): PlacaUsb[];
  pedirPermissao(nome: string): Promise<boolean>;
  abrir(nome: string): Promise<number>;
  escrever(alca: number, base64: string): Promise<void>;
  fechar(alca: number): Promise<void>;
  addListener(evento: 'onDados', fn: (e: { alca: number; b64: string }) => void): Assinatura;
  addListener(evento: 'onFim', fn: (e: { alca: number; motivo: string }) => void): Assinatura;
}

export const moduloUsbSerial: ModuloUsbSerial | null =
  requireOptionalNativeModule<ModuloUsbSerial>('BeeUsbSerial');
