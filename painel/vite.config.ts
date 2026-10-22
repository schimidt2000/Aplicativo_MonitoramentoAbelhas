import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * O painel é artefato separado e online (constituição, Restrições de Plataforma).
 * Sem PWA, sem service worker, sem cache de dados: o que ele mostra vem do
 * servidor a cada visita, ou da fonte de demonstração em memória.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
