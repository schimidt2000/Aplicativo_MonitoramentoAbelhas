/**
 * T031 — a sonda de internet do celular (camada 1 da guarda de portal cativo).
 * O expo-network é simulado: o que importa é como o estado do sistema vira
 * a resposta da sonda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));
vi.mock('expo-network', () => ({ getNetworkStateAsync: async () => estado.atual }));

import { sondaPadrao } from '@/nuvem/sondaPadrao.native';
import { sondaPadrao as sondaDoNavegador } from '@/nuvem/sondaPadrao';

describe('sonda de internet do celular', () => {
  beforeEach(() => { estado.atual = {}; });

  it('internet validada: segue', async () => {
    estado.atual = { isConnected: true, isInternetReachable: true };
    expect(await sondaPadrao()()).toBe(true);
  });

  it('Wi-Fi de praça sem internet (portal cativo): para antes de qualquer pedido', async () => {
    estado.atual = { isConnected: true, isInternetReachable: false };
    expect(await sondaPadrao()()).toBe(false);
  });

  it('sem conexão nenhuma: para', async () => {
    estado.atual = { isConnected: false, isInternetReachable: null };
    expect(await sondaPadrao()()).toBe(false);
  });

  it('o sistema não sabe: devolve null e deixa as outras camadas decidirem', async () => {
    estado.atual = { isConnected: true };
    expect(await sondaPadrao()()).toBeNull();
  });

  it('no navegador não há sonda (navigator.onLine não valida internet)', () => {
    expect(sondaDoNavegador()).toBeUndefined();
  });
});
