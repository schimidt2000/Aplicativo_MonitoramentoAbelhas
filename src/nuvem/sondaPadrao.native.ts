/**
 * A sonda de internet no celular (T031): primeira camada da guarda de portal
 * cativo. O Android só marca a rede como validada quando ela chega de fato à
 * internet (NET_CAPABILITY_VALIDATED), o que o Wi-Fi de praça com página de
 * login não faz. `isConnected` sozinho daria verdadeiro ali.
 *
 * Devolve `null` quando o sistema não sabe: a decisão passa para as camadas 2
 * e 3, nunca bloqueia um envio por falta de resposta da sonda.
 */
import { getNetworkStateAsync } from 'expo-network';

export function sondaPadrao(): () => Promise<boolean | null> {
  return async () => {
    const estado = await getNetworkStateAsync();
    if (estado.isConnected === false) return false;
    return estado.isInternetReachable ?? null;
  };
}
