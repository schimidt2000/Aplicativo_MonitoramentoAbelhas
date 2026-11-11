# Tasks: Tela simples para o apicultor

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Navegação (US1)

- [x] T801 [US1] Mover `src/app/(tabs)/{index,enviar,ajustes,coletar}.tsx` para `src/app/` e
  apagar `(tabs)/_layout.tsx`; registrar as telas na pilha de `src/app/_layout.tsx` (D-801)
- [x] T802 [US1] Atualizar os testes que citam `(tabs)` (`telas`, `encanamento`,
  `cabo-fronteira`) e o comentário de `src/ui/ResultadoDaColeta.tsx`
- [x] T803 [US1] Início: cabeçalho com apiário, total, colmeias para coletar e botão Ajustes;
  rodapé fixo com Coletar → `/coleta-cabo`; tirar o aviso de atraso e o Modo sol (FR-002,
  FR-005, FR-010)

## Phase 2: Cartão (US1)

- [x] T804 [P] [US1] `src/core/situacao.ts` + `tests/situacao.test.ts` (FR-003)
- [x] T805 [US1] Cartão com uma linha de situação, sem chip de bateria; celular/nuvem
  mantidos (FR-004)

## Phase 3: Envio (US4)

- [x] T806 [P] [US4] `src/data/envioUnico.ts` + `tests/envio-unico.test.ts` (FR-007)
- [x] T807 [US4] Linha de envio no Início e envio automático no foco; Enviar usa o guarda
  (FR-006, FR-007)

## Phase 4: Coletar (US2)

- [x] T808 [US2] `coleta-cabo`: título Coletar, colmeia numa linha com Trocar (FR-008)
- [x] T809 [US2] Ajustes: link para a coleta sem fio simulada no bloco de demonstração (FR-011)

## Phase 5: Colmeia (US3)

- [x] T810 [US3] Explicação dos voláteis recolhível (FR-009)

## Phase 6: Fechamento

- [x] T811 Textos novos em `pt-BR.ts`; `npm test`, `npm run typecheck`, `npm run check:fronteira`
- [ ] T812 Conferir no navegador em 375 px (feito) e com o modo avião no aparelho (pendente): Início, Coletar,
  Colmeia, Enviar — **parcial (2026-11-11, emulador Android 9, 2 GB, arm64 num Mac; não substitui o
  aparelho):** APK release do `b821db0`, modo avião ligado, 9.315 leituras no banco: Início,
  Colmeia, Coletar (placa simulada: 37 leituras salvas) e Enviar abriram sem erro; "Enviar
  agora" sem ligação ao projeto leva a "Ligar o celular ao projeto". `am start -W` 0,45–0,68 s
  em 10 arranques a frio (média ~0,60 s); PSS total ~106 MB ao abrir e ~125 MB depois de abrir
  uma colmeia e coletar — **parcial (2026-11-11, aparelho físico: Samsung SM-T595, Android 10,
  ~2,7 GB, 1200 × 1920; não é o aparelho de referência e o modo avião NÃO foi ligado):** APK
  release com o nome novo, 3.456 leituras de exemplo: Início, Colmeia e Coletar (placa
  simulada: 37 leituras salvas) abriram sem erro no logcat. `am start -W`: 4,94 s na primeira
  abertura depois de instalar (cria o banco e as leituras de exemplo) e 2,31–2,35 s em 10
  arranques a frio seguintes. PSS total ~108–112 MB no Início e ~116 MB com uma colmeia
  aberta. **Achado:** abrir a tela Coletar leva o PSS a ~180 MB e, durante a coleta, a
  ~195–201 MB (Graphics de ~33 MB para ~102 MB), e a memória não volta ao sair da tela. Fica
  acima do teto de 150 MB (Princípio II). Só aparece em aparelho físico: o emulador não conta
  memória de gráficos. Causa ainda não investigada — **parcial (2026-11-11, segundo aparelho
  físico: Samsung Galaxy A32 5G, SM-A326B, Android 13, ~3,6 GB, 720 × 1600, 64 bits; também não
  é o aparelho de referência e o modo avião NÃO foi ligado):** mesmo APK: Início, Colmeia e
  Coletar (placa simulada: 37 leituras salvas) sem erro no logcat. `am start -W`: 1,60 s na
  primeira abertura; nas 10 seguintes, 0,77–1,22 s em nove e 2,77 s em uma (mediana ~0,88 s).
  PSS total ~125–131 MB no Início, ~142 MB com uma colmeia aberta e ~143–146 MB na tela Coletar
  e durante a coleta: abaixo do teto de 150 MB, com pouca folga. O salto de ~70 MB da tela
  Coletar visto no tablet NÃO se repetiu aqui (Graphics de 9 a 15 MB)
