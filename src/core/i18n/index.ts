/**
 * Acesso aos textos. A chave é tipada: chave inexistente falha no typecheck, e
 * é isso que torna a regra "nenhuma string solta na tela" verificável.
 */
import { fmtNumero } from '../format';
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

/** Base das chaves que existem no singular: 'coleta.sucesso.salvas.um' -> 'coleta.sucesso.salvas'. */
type BaseDePlural<K> = K extends `${infer B}.um` ? B : never;
export type ChavePlural = BaseDePlural<ChaveTexto>;

/**
 * Escolhe `.um` ou `.outros` conforme `n`. O próprio `n` entra como {n},
 * já formatado em pt-BR (1.240), e `vars` pode acrescentar outras variáveis.
 */
export function tp(base: ChavePlural, n: number, vars?: Variaveis): string {
  const chave = `${base}.${n === 1 ? 'um' : 'outros'}` as ChaveTexto;
  return preencher(ptBR[chave], { n: fmtNumero(n), ...vars });
}

/** Só para teste: todas as chaves existentes. */
export function todasAsChaves(): ChaveTexto[] {
  return Object.keys(ptBR) as ChaveTexto[];
}
