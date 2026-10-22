/**
 * Idioma e vocabulário do painel (Princípio V, regras de idioma; Princípio VI,
 * rótulo do gás). Vale como o lint de "nenhuma string solta em componente".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ptBR } from '../src/textos/pt-BR';
import { t, todasAsChaves, tp } from '../src/textos';

const textos = Object.entries(ptBR) as [string, string][];

describe('vocabulário', () => {
  it('nunca "dashboard", nunca a sigla do formato da planilha', () => {
    for (const [k, v] of textos) {
      expect(v, k).not.toMatch(/dashboard/i);
      expect(v, k).not.toMatch(/\bCSV\b/);
    }
  });

  it('nenhuma palavra de programador em inglês na tela', () => {
    for (const [k, v] of textos) {
      expect(v, k).not.toMatch(/\b(hive|device|sync|sample|upload|download|offline|error)\b/i);
    }
  });

  it('o gás nunca é CO₂: só "eCO₂" ou "não é CO₂"', () => {
    for (const [k, v] of textos) {
      const resto = v.replace(/eCO₂|eco2/gi, '').replace(/[Nn]ão é CO₂/g, '').replace(/nao_e_co2/g, '');
      expect(resto, k).not.toMatch(/CO₂|CO2/i);
    }
  });

  it('o canal de gás é chamado de voláteis (COVs) onde é exibido', () => {
    expect(ptBR['grafico.vol.titulo']).toMatch(/Voláteis .*\(COVs\)/);
    expect(ptBR['grafico.vol.subtitulo']).toMatch(/Não é CO₂/);
  });

  it('falta de rede não vira "erro" nem "falha" na manchete', () => {
    for (const k of ['rede.sem_internet.titulo', 'rede.servidor.titulo'] as const) {
      expect(ptBR[k]).not.toMatch(/erro|falha|offline/i);
    }
  });

  it('a temperatura média não é chamada de mediana (o servidor guarda média)', () => {
    for (const [k, v] of textos) {
      if (k.startsWith('grafico.temp') || k.startsWith('colmeia.dia') || k.startsWith('colmeia.resumo')) {
        expect(v, k).not.toMatch(/mediana/i);
      }
    }
  });
});

describe('módulo de textos', () => {
  it('todo plural tem as duas formas', () => {
    const chaves = new Set(todasAsChaves());
    for (const k of chaves) {
      if (k.endsWith('.um')) expect(chaves.has(k.replace(/\.um$/, '.outros') as never), k).toBe(true);
      if (k.endsWith('.outros')) expect(chaves.has(k.replace(/\.outros$/, '.um') as never), k).toBe(true);
    }
  });

  it('tp escolhe a forma e formata o número em pt-BR', () => {
    expect(tp('visao.contagem', 1)).toBe('1 colmeia');
    expect(tp('visao.contagem', 1240)).toBe('1.240 colmeias');
    expect(tp('visao.contagem', 0)).toBe('0 colmeias');
  });

  it('t preenche variáveis e mantém as que faltam visíveis', () => {
    expect(t('nav.quem', { email: 'a@b' })).toBe('Entrou como a@b');
    expect(t('nav.quem')).toBe('Entrou como {email}');
  });
});

/** Arquivos .tsx de `src/`, para o lint de string solta. */
function componentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return componentes(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const LETRAS = /\p{L}{2,}/u;
/**
 * Atributos TÉCNICOS: o valor deles nunca aparece na tela nem no leitor de
 * tela. Todo outro atributo é tratado como texto — inclusive props de
 * componente próprio (`titulo`, `subtitulo`, `rotulo`), que viram texto lá
 * dentro. Lista de permissão, não de proibição: atributo novo começa vigiado.
 */
const ATRIBUTOS_TECNICOS = new Set([
  'className', 'id', 'htmlFor', 'type', 'role', 'scope', 'name', 'method', 'autoComplete',
  'aria-live', 'path', 'to', 'key', 'motivo', 'lang', 'rel', 'target', 'href', 'inputMode', 'ref',
]);

/**
 * Posições de VALOR de uma expressão: o que pode acabar como texto na tela.
 * `a ? 'x' : 'y'` mostra 'x' ou 'y'; `a && 'x'` mostra 'x'; a condição em si
 * (`estado === 'ok'`) não é mostrada e não conta.
 */
function literaisEmValor(e: ts.Expression): ts.Node[] {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) return literaisEmValor(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return LETRAS.test(e.text) ? [e] : [];
  if (ts.isTemplateExpression(e)) {
    const partes = [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(' ');
    return LETRAS.test(partes) ? [e] : [];
  }
  if (ts.isConditionalExpression(e)) return [...literaisEmValor(e.whenTrue), ...literaisEmValor(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return literaisEmValor(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken
        || op === ts.SyntaxKind.PlusToken) {
      return [...literaisEmValor(e.left), ...literaisEmValor(e.right)];
    }
  }
  return [];
}

/**
 * Varre a árvore do TypeScript: texto JSX com letras, atributo não técnico com
 * string literal, e string literal com letras em posição de valor dentro de
 * chaves de JSX (filho ou atributo), inclusive nos ramos de `?:`, `&&` e `||`.
 */
function literaisVisiveis(codigo: string, nome = 'x.tsx'): string[] {
  const fonte = ts.createSourceFile(nome, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const achados: string[] = [];
  const visitar = (no: ts.Node) => {
    if (ts.isJsxText(no) && LETRAS.test(no.text)) achados.push(no.text.trim());
    if (ts.isJsxAttribute(no)) {
      if (ATRIBUTOS_TECNICOS.has(no.name.getText(fonte))) return;
      if (no.initializer && ts.isStringLiteral(no.initializer) && LETRAS.test(no.initializer.text)) {
        achados.push(no.getText(fonte));
      }
    }
    if (ts.isJsxExpression(no) && no.expression) {
      for (const l of literaisEmValor(no.expression)) achados.push(l.getText(fonte));
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achados;
}

describe('nenhuma string visível fora do módulo de textos', () => {
  const raiz = fileURLToPath(new URL('../src', import.meta.url));
  const arquivos = componentes(raiz);

  it('o verificador pega texto solto, atributo e string em chaves', () => {
    expect(literaisVisiveis('const a = <p>Olá mundo</p>;')).toEqual(['Olá mundo']);
    expect(literaisVisiveis('const a = <input placeholder="Digite" />;')).toEqual(['placeholder="Digite"']);
    expect(literaisVisiveis("const a = <p>{'Sair'}</p>;")).toEqual(["'Sair'"]);
    expect(literaisVisiveis("const a = <p>{t('nav.sair')}{' · '}</p>;")).toEqual([]);
  });

  it('o verificador pega texto em prop de componente e em ramo de condição', () => {
    expect(literaisVisiveis('const a = <Grafico titulo="Temperatura" />;')).toEqual(['titulo="Temperatura"']);
    expect(literaisVisiveis("const a = <p>{ok ? 'Sem dado' : null}</p>;")).toEqual(["'Sem dado'"]);
    expect(literaisVisiveis("const a = <p>{ok && 'Pronto'}</p>;")).toEqual(["'Pronto'"]);
    expect(literaisVisiveis('const a = <p>{`Dia ${n}`}</p>;')).toEqual(['`Dia ${n}`']);
    expect(literaisVisiveis("const a = <G subtitulo={x ? t('a') : 'Gás'} />;")).toEqual(["'Gás'"]);
  });

  it('o verificador não reprova o que não aparece na tela', () => {
    expect(literaisVisiveis("const a = <p className=\"caixa aviso\">{estado === 'ok' ? t('a') : null}</p>;")).toEqual([]);
    expect(literaisVisiveis("const a = <Link to=\"/planilha\" />;")).toEqual([]);
    expect(literaisVisiveis("const a = <b onClick={() => ir('/planilha')} />;")).toEqual([]);
  });

  it('há componentes para verificar', () => {
    expect(arquivos.length).toBeGreaterThan(5);
  });

  for (const arq of arquivos) {
    it(arq.slice(raiz.length + 1), () => {
      expect(literaisVisiveis(readFileSync(arq, 'utf8'), arq)).toEqual([]);
    });
  }
});
