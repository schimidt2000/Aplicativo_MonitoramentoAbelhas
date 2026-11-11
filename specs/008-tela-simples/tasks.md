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
  Colmeia, Enviar
