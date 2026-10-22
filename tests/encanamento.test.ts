/**
 * O painel (painel/) e o servidor (servidor/) moram no mesmo repositório que o
 * app de campo, sem ferramenta de workspace. Três linhas de configuração
 * impedem que um quebre o outro; este teste impede que alguém as desfaça sem
 * perceber (risco "dois artefatos, um time" do plano aceito da 002).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exigir = createRequire(import.meta.url);

describe('encanamento do repositório', () => {
  it('o Metro não varre painel/ nem servidor/, e só eles', () => {
    const metro = exigir(path.join(raiz, 'metro.config.js'));
    const bloqueia = (rel: string) =>
      (metro.resolver.blockList as RegExp[]).some((r) => r.test(path.join(raiz, rel)));

    expect(bloqueia('painel/node_modules/react/index.js')).toBe(true);
    expect(bloqueia('painel/src/main.tsx')).toBe(true);
    expect(bloqueia('servidor/001_schema.sql')).toBe(true);

    expect(bloqueia('src/app/(tabs)/enviar.tsx')).toBe(false);
    expect(bloqueia('src/ui/painel/qualquer.tsx')).toBe(false);
    expect(bloqueia('node_modules/um-pacote/painel/x.js')).toBe(false);
  });

  it('o Metro mantém os bloqueios padrão do Expo (.expo/types, cache web, __tests__)', () => {
    const metro = exigir(path.join(raiz, 'metro.config.js'));
    const { getDefaultConfig } = exigir('expo/metro-config');
    const padrao = ([] as RegExp[]).concat(getDefaultConfig(raiz).resolver.blockList ?? []);
    expect(padrao.length).toBeGreaterThan(0);
    const nossos = (metro.resolver.blockList as RegExp[]).map(String);
    for (const r of padrao) expect(nossos).toContain(String(r));
  });

  it('o typecheck do app não olha painel/ nem servidor/', () => {
    const ts = JSON.parse(readFileSync(path.join(raiz, 'tsconfig.json'), 'utf8'));
    expect(ts.exclude).toEqual(expect.arrayContaining(['painel', 'servidor']));
  });

  it('o vitest do app só roda os testes do app', () => {
    const cfg = readFileSync(path.join(raiz, 'vitest.config.mts'), 'utf8');
    expect(cfg).toMatch(/include:\s*\['tests\/\*\*\/\*\.test\.ts'\]/);
  });

  it('o app de campo não depende do SDK do Supabase (fetch puro)', () => {
    const pkg = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((d) => d.startsWith('@supabase/'))).toEqual([]);
    expect(pkg.scripts['servidor:teste']).toBeDefined();
    expect(pkg.scripts['painel:build']).toBeDefined();
  });
});
