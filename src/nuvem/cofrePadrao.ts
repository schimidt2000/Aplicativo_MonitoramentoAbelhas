/**
 * O cofre padrão no navegador (e nos testes): memória. Não há cofre protegido
 * no navegador, e guardar a sessão no localStorage violaria FR-015. O Metro
 * escolhe `cofrePadrao.native.ts` no celular (T030).
 */
import { cofreEmMemoria, type Cofre } from './supabase/cofre';

export function cofrePadrao(): Cofre {
  return cofreEmMemoria();
}
