/**
 * Erros do decodificador binário, num módulo à parte para que `v1.ts` não
 * precise importar `index.ts` (que importa `v1.ts`): sem ciclo de require.
 */
export class QuadroInvalidoError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuadroInvalidoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
