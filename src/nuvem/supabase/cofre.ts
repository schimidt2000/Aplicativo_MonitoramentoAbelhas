/**
 * Onde o cliente guarda a sessão e o vínculo. A sessão é credencial de acesso
 * a dado de terceiro: FR-015 exige armazenamento protegido do aparelho.
 *
 * No celular (app instalado e Expo Go), `cofreProtegido` guarda no cofre do
 * sistema (expo-secure-store: Keystore no Android, Keychain no iOS), e o
 * apicultor digita o código do projeto uma vez só, mesmo que o app feche
 * (T030). No navegador não há cofre protegido: fica `cofreEmMemoria`, e o
 * custo é pedir o código de novo depois que a página fecha. Guardar o token no
 * localStorage cumpriria a conveniência e violaria FR-015.
 */
export interface Cofre {
  ler(chave: string): Promise<string | null>;
  gravar(chave: string, valor: string): Promise<void>;
  apagar(chave: string): Promise<void>;
}

export function cofreEmMemoria(): Cofre {
  const dados = new Map<string, string>();
  return {
    async ler(chave) { return dados.get(chave) ?? null; },
    async gravar(chave, valor) { dados.set(chave, valor); },
    async apagar(chave) { dados.delete(chave); },
  };
}

/** O que usamos de `expo-secure-store`. Injetado, para testar sem aparelho. */
export interface CofreDoSistema {
  getItemAsync(chave: string): Promise<string | null>;
  setItemAsync(chave: string, valor: string): Promise<void>;
  deleteItemAsync(chave: string): Promise<void>;
}

/**
 * O cofre do sistema, com a memória como rede de segurança: se o cofre falhar
 * (aparelho com Keystore quebrado, valor recusado), o envio continua nesta
 * sessão do app em vez de travar, e só perde a conveniência de lembrar.
 */
export function cofreProtegido(sistema: CofreDoSistema): Cofre {
  const memoria = cofreEmMemoria();
  return {
    async ler(chave) {
      const daMemoria = await memoria.ler(chave);
      if (daMemoria !== null) return daMemoria;
      try {
        return await sistema.getItemAsync(chave);
      } catch {
        return null;
      }
    },
    async gravar(chave, valor) {
      await memoria.gravar(chave, valor);
      try { await sistema.setItemAsync(chave, valor); } catch { /* fica só na memória */ }
    },
    async apagar(chave) {
      await memoria.apagar(chave);
      try { await sistema.deleteItemAsync(chave); } catch { /* nada a apagar */ }
    },
  };
}
