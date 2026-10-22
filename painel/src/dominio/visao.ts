/**
 * Regras puras da visão geral: ordenação e busca por apicultor.
 *
 * A busca roda SÓ no navegador, sobre a lista já carregada: nome de pessoa
 * nunca vai para o endereço nem para o servidor (FR-033, SC-012).
 */
import type { ColmeiaMacro } from '../dados/porta';

/** Minúsculas e sem acento: "José" acha "jose", "Conceição" acha "conceicao". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filtrarPorApicultor(colmeias: ColmeiaMacro[], busca: string): ColmeiaMacro[] {
  const b = normalizar(busca);
  if (b === '') return colmeias;
  return colmeias.filter((c) => normalizar(c.apicultorNome).includes(b));
}

export function ordenarVisao(colmeias: ColmeiaMacro[]): ColmeiaMacro[] {
  return [...colmeias].sort(
    (a, b) =>
      a.apicultorNome.localeCompare(b.apicultorNome, 'pt-BR')
      || a.localNome.localeCompare(b.localNome, 'pt-BR')
      || a.colmeiaNome.localeCompare(b.colmeiaNome, 'pt-BR', { numeric: true }),
  );
}
