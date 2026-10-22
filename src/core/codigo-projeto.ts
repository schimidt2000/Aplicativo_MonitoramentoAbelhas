/**
 * Código do projeto: o que a pesquisadora passa ao apicultor para ligar o
 * celular ao projeto. Domínio puro, sem plataforma e sem rede.
 *
 * Formato: 8 símbolos do base32 de Crockford, exibidos `XXXX-XXXX`. Os 7
 * primeiros são o corpo; o 8º é o dígito verificador (Luhn mod 32).
 *
 * Por que Crockford: o alfabeto não tem I, L, O nem U, que se confundem ao
 * ditar por telefone. Na leitura, O vira 0 e I/L viram 1 — quem digita
 * "O" querendo "0" não é punido.
 *
 * Por que Luhn mod N: detecta TODA troca de um símbolo por outro e quase toda
 * inversão de dois vizinhos. É isso que deixa o erro de digitação ser barrado
 * no aparelho, antes de qualquer rede, sem contar como tentativa (FR-012).
 *
 * O servidor tem a MESMA regra em plpgsql (`servidor/001_schema.sql`,
 * `project_code_check_char`). `servidor/golden/codigos.json` é o caso de
 * referência que prende as duas implementações uma à outra.
 */

export const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = ALFABETO.length; // 32
export const TAMANHO_CORPO = 7;
export const TAMANHO_CODIGO = TAMANHO_CORPO + 1;

function valor(c: string): number {
  return ALFABETO.indexOf(c);
}

/**
 * Normaliza o que a pessoa digitou: maiúsculas, sem espaço nem hífen, e as
 * leituras toleradas de Crockford (O→0, I→1, L→1). Não valida.
 */
export function normalizarCodigo(digitado: string): string {
  return digitado
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Dígito verificador Luhn mod 32 do corpo. Lança se o corpo tiver símbolo fora do alfabeto. */
export function digitoVerificador(corpo: string): string {
  let fator = 2;
  let soma = 0;
  for (let i = corpo.length - 1; i >= 0; i--) {
    const v = valor(corpo[i]);
    if (v < 0) throw new Error(`símbolo fora do alfabeto: ${corpo[i]}`);
    let adendo = fator * v;
    fator = fator === 2 ? 1 : 2;
    adendo = Math.floor(adendo / N) + (adendo % N);
    soma += adendo;
  }
  const resto = soma % N;
  return ALFABETO[(N - resto) % N];
}

export type ValidacaoCodigo =
  | { ok: true; codigo: string }
  | { ok: false; motivo: 'vazio' | 'tamanho' | 'simbolo' | 'verificador' };

/**
 * Valida localmente. `codigo` devolvido é a forma canônica (8 símbolos, sem
 * hífen), que é exatamente o que vai ao servidor.
 */
export function validarCodigo(digitado: string): ValidacaoCodigo {
  const c = normalizarCodigo(digitado);
  if (c.length === 0) return { ok: false, motivo: 'vazio' };
  for (const s of c) if (valor(s) < 0) return { ok: false, motivo: 'simbolo' };
  if (c.length !== TAMANHO_CODIGO) return { ok: false, motivo: 'tamanho' };
  const corpo = c.slice(0, TAMANHO_CORPO);
  if (digitoVerificador(corpo) !== c[TAMANHO_CORPO]) {
    return { ok: false, motivo: 'verificador' };
  }
  return { ok: true, codigo: c };
}

/** `ABCD1234` → `ABCD-1234`. Aceita forma parcial, para formatar enquanto digita. */
export function formatarCodigo(digitado: string): string {
  const c = normalizarCodigo(digitado).slice(0, TAMANHO_CODIGO);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Monta um código completo a partir de um corpo de 7 símbolos. */
export function codigoComVerificador(corpo: string): string {
  const c = normalizarCodigo(corpo);
  if (c.length !== TAMANHO_CORPO) throw new Error('o corpo tem 7 símbolos');
  return c + digitoVerificador(c);
}
