/**
 * A sonda de internet no navegador (e nos testes): nenhuma. `navigator.onLine`
 * não valida internet, então a guarda de portal fica nas camadas 2 e 3 (a saúde
 * do Auth e o esquema da resposta). O Metro escolhe `sondaPadrao.native.ts` no
 * celular (T031).
 */
export function sondaPadrao(): (() => Promise<boolean | null>) | undefined {
  return undefined;
}
