/**
 * Acesso aos textos do painel. Chave tipada: chave inexistente falha no
 * typecheck. Mesma forma de `src/core/i18n` do app de campo.
 */
import { ptBR, type ChaveTexto } from './pt-BR';

export type { ChaveTexto };

type Variaveis = Record<string, string | number>;

function preencher(modelo: string, vars?: Variaveis): string {
  if (!vars) return modelo;
  return modelo.replace(/\{(\w+)\}/g, (achado, nome: string) =>
    nome in vars ? String(vars[nome]) : achado,
  );
}

export function t(chave: ChaveTexto, vars?: Variaveis): string {
  return preencher(ptBR[chave], vars);
}

type BaseDePlural<K> = K extends `${infer B}.um` ? B : never;
export type ChavePlural = BaseDePlural<ChaveTexto>;

/** Escolhe `.um` ou `.outros`; `n` entra como {n} já formatado em pt-BR. */
export function tp(base: ChavePlural, n: number, vars?: Variaveis): string {
  const chave = `${base}.${n === 1 ? 'um' : 'outros'}` as ChaveTexto;
  return preencher(ptBR[chave], { n: n.toLocaleString('pt-BR'), ...vars });
}

export function todasAsChaves(): ChaveTexto[] {
  return Object.keys(ptBR) as ChaveTexto[];
}
