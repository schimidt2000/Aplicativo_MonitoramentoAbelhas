/**
 * Busca assíncrona com os três estados que toda tela do painel precisa mostrar:
 * buscando, pronto, ou problema com o que fazer. Sem cache: o painel é online
 * e não guarda dado entre visitas (FR-032).
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { ProblemaDados, type FontePainel, type MotivoProblema } from '../dados/porta';

export const FonteContexto = createContext<FontePainel | null>(null);

export function useFonte(): FontePainel {
  const f = useContext(FonteContexto);
  if (!f) throw new Error('FonteContexto ausente');
  return f;
}

export type Carga<T> =
  | { estado: 'carregando' }
  | { estado: 'ok'; dados: T }
  | { estado: 'problema'; motivo: MotivoProblema };

export function motivoDe(e: unknown): MotivoProblema {
  return e instanceof ProblemaDados ? e.motivo : 'servidor';
}

export function useCarregar<T>(buscar: () => Promise<T>, deps: readonly unknown[]): [Carga<T>, () => void] {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarga({ estado: 'carregando' });
    buscar().then(
      (dados) => { if (vivo) setCarga({ estado: 'ok', dados }); },
      (e: unknown) => { if (vivo) setCarga({ estado: 'problema', motivo: motivoDe(e) }); },
    );
    return () => { vivo = false; };
    // `buscar` muda a cada render; quem chama declara as dependências reais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tentativa]);

  return [carga, () => setTentativa((n) => n + 1)];
}
