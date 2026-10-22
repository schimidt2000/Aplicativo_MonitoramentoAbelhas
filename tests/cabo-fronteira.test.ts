/**
 * Fronteiras da feature 004, verificadas por comando e não por promessa.
 *
 *  - Princípio III: a tela de cabo NÃO GRAVA. Seguimos todos os imports a
 *    partir de `src/app/cabo.tsx` (transitivamente) e nenhum pode chegar a
 *    `src/data` — sem acesso ao banco, não há como gravar leitura (SC-004).
 *  - Princípio V: nenhum texto solto em JSX nos componentes da 004; tudo vem
 *    do módulo de i18n.
 *  - Princípio IV: a porta serial só aparece em `src/transports/` (a mesma
 *    regra está em scripts/check-fronteira.sh, que roda no CI).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '..');
const SRC = join(RAIZ, 'src');

function resolverImport(de: string, alvo: string): string | null {
  let base: string;
  if (alvo.startsWith('@/')) base = join(SRC, alvo.slice(2));
  else if (alvo.startsWith('.')) base = resolve(dirname(de), alvo);
  else return null; // pacote: não é código nosso
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  // db.ts não existe: o Metro escolhe db.native/db.web. Conta como src/data mesmo assim.
  return `${base}.ts`;
}

function importsDe(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8');
  const achados = [
    ...fonte.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),
    ...fonte.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...fonte.matchAll(/^import\s+['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]);
  return achados.map((a) => resolverImport(arquivo, a)).filter((x): x is string => x !== null);
}

function alcancaveis(inicio: string): Set<string> {
  const vistos = new Set<string>();
  const pilha = [inicio];
  while (pilha.length) {
    const atual = pilha.pop() as string;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    if (!existsSync(atual)) continue;
    pilha.push(...importsDe(atual));
  }
  return vistos;
}

const rel = (p: string) => relative(RAIZ, p).split('\\').join('/');

function arquivosEm(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivosEm(p) : [p];
  });
}

describe('feature 004: a tela de cabo não grava nada', () => {
  const grafo = [...alcancaveis(join(SRC, 'app', 'cabo.tsx'))].map(rel);

  it('o grafo de imports foi seguido de verdade', () => {
    // Se o resolvedor quebrar, o teste abaixo passaria sem olhar nada.
    expect(grafo).toContain('src/transports/cable/serial.ts');
    expect(grafo).toContain('src/core/decode/bancada0.ts');
    expect(grafo).toContain('src/core/bancada/sessao.ts');
  });

  it('nenhum arquivo alcançável a partir da tela está em src/data', () => {
    expect(grafo.filter((p) => p.startsWith('src/data/'))).toEqual([]);
  });

  it('nada alcançável a partir da tela chama a rede (Princípio I)', () => {
    expect(grafo.filter((p) => p.startsWith('src/nuvem/'))).toEqual([]);
    const comRede = grafo
      .filter((p) => existsSync(join(RAIZ, p)))
      .filter((p) => /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(readFileSync(join(RAIZ, p), 'utf8')));
    expect(comRede).toEqual([]);
  });

  it('o detector pega um import do banco, se alguém puser um', () => {
    // Sanidade do próprio teste: a tela de Coletar grava, e o grafo dela chega a src/data.
    const coletar = [...alcancaveis(join(SRC, 'app', '(tabs)', 'coletar.tsx'))].map(rel);
    expect(coletar.some((p) => p.startsWith('src/data/'))).toBe(true);
  });
});

describe('feature 004: textos e fronteira de transporte', () => {
  const COMPONENTES = ['src/app/cabo.tsx', 'src/ui/GraficoAoVivo.tsx', 'src/ui/IconesCabo.tsx'];

  it('nenhum texto solto em JSX nos componentes da 004', () => {
    for (const c of COMPONENTES) {
      const fonte = readFileSync(join(RAIZ, c), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')   // comentários de bloco e {/* JSX */}
        .replace(/^\s*\/\/.*$/gm, '');      // comentários de linha
      // Texto entre > e < que tenha letra: "<Text>Olá</Text>".
      const soltos = [...fonte.matchAll(/>\s*([^<>{}\n]*[A-Za-zÀ-ú][^<>{}\n]*?)\s*</g)]
        .map((m) => m[1].trim())
        .filter((s) => s && !/^[)\]};,:?]/.test(s) && !/=>|&&|\|\||===/.test(s));
      expect(soltos, c).toEqual([]);
    }
  });

  // A mesma regra de scripts/check-fronteira.sh: pega também `(navigator as X).serial`,
  // `nav?.serial` e `navigator['serial']`, não só o literal `navigator.serial`.
  const PORTA_SERIAL = /\.serial\b|\[\s*['"]serial['"]\s*\]|['"]serial['"]\s+in\b|requestPort\(|getPorts\(/;

  it('o detector da porta serial pega acesso por conversão de tipo e por índice', () => {
    expect(PORTA_SERIAL.test('const s = (navigator as unknown as { serial: X }).serial;')).toBe(true);
    expect(PORTA_SERIAL.test('nav?.serial ?? null')).toBe(true);
    expect(PORTA_SERIAL.test("navigator['serial']")).toBe(true);
    expect(PORTA_SERIAL.test("'serial' in navigator")).toBe(true);
    expect(PORTA_SERIAL.test("t('cabo.problema.porta_ocupada.detalhe') // Monitor Serial")).toBe(false);
  });

  it('a porta serial só aparece em src/transports/', () => {
    const fora = arquivosEm(SRC)
      .filter((p) => /\.(ts|tsx)$/.test(p) && !rel(p).startsWith('src/transports/'))
      .filter((p) => PORTA_SERIAL.test(readFileSync(p, 'utf8')))
      .map(rel);
    expect(fora).toEqual([]);
  });
});
