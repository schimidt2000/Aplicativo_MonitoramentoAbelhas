import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Os testes rodam em Node contra `better-sqlite3`, o terceiro driver do mesmo
 * módulo de acesso a dados. É isso que torna o teste representativo: o SQL
 * exercitado aqui é literalmente o SQL que roda no celular.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
