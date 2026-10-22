/**
 * O grafo de imports do código do app, seguido de verdade, para os testes de
 * fronteira (mesmo resolvedor de tests/cabo-fronteira.test.ts, da 004).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const RAIZ = resolve(__dirname, '..', '..');
export const SRC = join(RAIZ, 'src');

function resolverImport(de: string, alvo: string): string | null {
  let base: string;
  if (alvo.startsWith('@/')) base = join(SRC, alvo.slice(2));
  else if (alvo.startsWith('.')) base = resolve(dirname(de), alvo);
  else return null; // pacote: não é código nosso
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  // db.ts não existe: o Metro escolhe db.native/db.web. Conta como o caminho mesmo assim.
  return `${base}.ts`;
}

/** Imports de valor E de tipo: um `import type` também é dependência de fronteira. */
function importsDe(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8');
  const achados = [
    ...fonte.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),
    ...fonte.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...fonte.matchAll(/^import\s+['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]);
  return achados.map((a) => resolverImport(arquivo, a)).filter((x): x is string => x !== null);
}

export const rel = (p: string) => relative(RAIZ, p).split('\\').join('/');

/** Todos os arquivos alcançáveis a partir de `inicio` (caminhos relativos à raiz). */
export function alcancaveis(inicio: string): string[] {
  const vistos = new Set<string>();
  const pilha = [inicio];
  while (pilha.length) {
    const atual = pilha.pop() as string;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    if (!existsSync(atual)) continue;
    pilha.push(...importsDe(atual));
  }
  return [...vistos].map(rel);
}

/** Os arquivos alcançáveis que chamam a rede. */
export function comRede(grafo: string[]): string[] {
  return grafo
    .filter((p) => existsSync(join(RAIZ, p)))
    .filter((p) => /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(readFileSync(join(RAIZ, p), 'utf8')));
}
