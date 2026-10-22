/**
 * Onde o cliente guarda a sessão e o vínculo. A sessão é credencial de acesso
 * a dado de terceiro: FR-015 exige armazenamento protegido do aparelho.
 *
 * A implementação protegida (expo-secure-store) depende de instalar a
 * dependência, o que esta fatia NÃO fez (tasks.md, T030). Até lá, o registro
 * usa `cofreEmMemoria`: nada vai para disco sem proteção, e o custo é pedir o
 * código de novo depois que o app fecha. É a escolha honesta: guardar o token
 * no SQLite ou no localStorage cumpriria a conveniência e violaria FR-015.
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
