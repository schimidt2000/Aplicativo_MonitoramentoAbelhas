/**
 * O cofre padrão no celular (app instalado e Expo Go): o cofre do sistema,
 * pelo expo-secure-store (T030, FR-015). O apicultor digita o código do projeto
 * uma vez só, mesmo que o app feche.
 */
import * as SecureStore from 'expo-secure-store';
import { cofreProtegido, type Cofre } from './supabase/cofre';

export function cofrePadrao(): Cofre {
  return cofreProtegido(SecureStore);
}
