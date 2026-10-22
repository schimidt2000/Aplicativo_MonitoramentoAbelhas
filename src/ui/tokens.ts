/**
 * ~24 tokens semânticos. Tema claro único de alto contraste — sob sol, um tema
 * escuro é a pior escolha possível: o reflexo ambiente vira o próprio fundo.
 * Contraste mínimo 7:1 no texto primário (Princípio V).
 * Nenhum desfoque, nenhuma sombra em lista, nenhuma fonte customizada.
 */
export const cores = {
  fundo: '#F7F5F0',
  superficie: '#FFFFFF',
  // Contrastes calculados (WCAG 2.x) sobre superficie (#FFFFFF) / fundo (#F7F5F0).
  // tests/tokens.test.ts recalcula e reprova se algum piso cair.
  texto: '#0B0B0B',        // 19,7:1 / 18,1:1 — texto primário (>= 7:1)
  textoFraco: '#4A4A4A',   // 8,9:1 / 8,1:1 — passa até o piso do primário
  // Só divisória e fundo decorativo (barra de progresso, aba, grade do gráfico):
  // 1,5:1 / 1,4:1 — NÃO serve para delimitar controle.
  linha: '#D8D3C8',
  // Borda de botão, opção e card tocável quando a borda é o único limite visual
  // do alvo: 3,7:1 / 3,4:1 (>= 3:1, Princípio V).
  bordaControle: '#8A8578',
  // As cores abaixo NÃO chegam a 7:1: servem a texto secundário (>= 4,5:1),
  // ícone e borda. Texto primário deveria usar `texto`; os usos herdados como
  // texto primário estão listados no Complexity Tracking de
  // specs/001-coleta-offline/plan.md.
  acento: '#8A5A00',       // âmbar escuro, 5,9:1 / 5,4:1
  ok: '#166534',           // 7,1:1 / 6,5:1
  atencao: '#B45309',      // 5,0:1 / 4,6:1 — sempre acompanhado de ícone e palavra
  perigo: '#B91C1C',       // 6,5:1 / 5,9:1
  neutro: '#3A5A8A',       // 6,98:1 / 6,4:1 — sincronização, nunca vermelho
};

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const tipo = {
  corpo: 16,        // mínimo do Princípio V
  rotulo: 14,
  titulo: 22,
  leitura: 34,      // número de leitura >= 32sp
  destaque: 44,
};

export const alvo = {
  minimo: 56,       // luva vence os 48dp do Material
  linha: 72,
  espacamento: 12,
};

export const raio = { sm: 6, md: 10 };

/** Modo sol: um toque, aumenta tipo e engrossa bordas (FR-025). */
export const MODO_SOL_ESCALA = 1.15;
export const MODO_SOL_BORDA = 2;
