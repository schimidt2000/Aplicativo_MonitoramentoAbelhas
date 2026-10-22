/**
 * Modo sol (FR-025): um toque, persistido, aumenta o tipo e engrossa bordas.
 * Resolve a reclamação de campo que o tema escuro não resolve.
 */
import React, { createContext, useContext, useState } from 'react';

const Ctx = createContext<{ sol: boolean; alternar: () => void }>({
  sol: false, alternar: () => {},
});

export const useModoSol = () => useContext(Ctx);

export function ModoSolProvider({ children }: { children: React.ReactNode }) {
  const [sol, setSol] = useState(false);
  return (
    <Ctx.Provider value={{ sol, alternar: () => setSol((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}
