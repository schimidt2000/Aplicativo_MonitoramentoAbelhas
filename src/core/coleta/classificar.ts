/**
 * Transforma "algo foi lançado" em "o que aconteceu, em termos do usuário".
 *
 * Decide por TIPO de erro, nunca por texto: `message` é técnica, às vezes em
 * inglês, e muda sem aviso. É também por isso que o erro do transporte é
 * tipado (`TransportError`).
 */
import { QuadroInvalidoError, VersaoDesconhecidaError } from '../decode';
import { TransportError } from '../ports/transport';
import type { CodigoProblema } from './resultado';

export type FaseColeta = 'procurando' | 'conectando' | 'transferindo';

/**
 * Falha ao gravar no banco local. Embrulha a causa para distinguir "o disco
 * encheu" de "o transporte caiu" — os dois lançam `Error` genérico.
 */
export class FalhaDeGravacaoError extends Error {
  constructor(readonly causa: unknown) {
    super('Falha ao gravar no banco local.');
    this.name = 'FalhaDeGravacaoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function classificar(e: unknown, fase: FaseColeta): CodigoProblema {
  if (e instanceof FalhaDeGravacaoError) return 'nao-salvou';
  if (e instanceof VersaoDesconhecidaError) return 'formato-desconhecido';
  if (e instanceof QuadroInvalidoError) return 'dados-corrompidos';

  if (e instanceof TransportError) {
    if (e.code === 'permission' || e.code === 'unavailable') {
      return 'transporte-indisponivel';
    }
    if (fase === 'procurando') return 'nenhuma-colmeia';
    if (fase === 'conectando') return 'nao-conectou';
    return 'conexao-caiu';
  }
  return 'inesperado';
}
