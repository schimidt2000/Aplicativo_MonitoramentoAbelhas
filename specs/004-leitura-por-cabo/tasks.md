---
description: "Tarefas da feature 004 — leitura da placa pelo cabo, ao vivo"
---

# Tasks: Leitura da placa pelo cabo, ao vivo (monitor de bancada)

**Input**: `specs/004-leitura-por-cabo/` — spec.md, plan.md

**Tests**: pedidos explicitamente (SC-002, SC-003, SC-004 e a regra de teste por mutação nos
pontos críticos). Cada teste crítico foi quebrado de propósito uma vez para conferir que pega
(lista em plan.md, "Verificação").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: história da spec (US1…US5)

## Phase 1: Setup

- [x] T001 Criar `specs/004-leitura-por-cabo/` (spec, checklist, plan, tasks) e apontar
  `.specify/feature.json` para a 004. *Nota (2026-10-22):* `feature.json` voltou para a 003
  no merge `be1f2ab`, por decisão do dono do produto (muda quando a 005 integrar)
- [x] T002 Registrar o formato `bancada-0` como suposição não confirmada em
  `docs/integracao-firmware.md`, com o pedido de identificador, número e versão

## Phase 2: Foundational

- [x] T003 [P] Leitor puro `src/core/decode/bancada0.ts`: linha casada inteira e exata,
  centésimos exatos sem float, `nan`/`inf`/`ovf` → NULL com motivo, status do gás e flag de
  aquecimento, texto, ilegível (fora do formato, caracteres estranhos, longa demais), vazia
- [x] T004 [P] Tabela `formato → leitor` em `src/core/decode/linhas.ts`, com
  `FormatoDeLinhaDesconhecidoError` e `TAMANHO_MAXIMO_DE_LINHA`
- [x] T005 [P] `tests/bancada0.test.ts`: as 7 linhas de exemplo, cortadas, CRLF/LF, lixo,
  negativos, `nan`, 3 casas, campo trocado, status fora de 0–3, formato desconhecido
  (SC-002, SC-003)
- [x] T006 [P] Junção de linhas `src/transports/cable/linhas.ts` (pedaços, `\r\n`/`\n`/`\r`,
  teto de 512 com descarte até o fim de linha, `interromper()`) e `tests/cabo-linhas.test.ts`
  (todos os pontos de corte)
- [x] T007 Mapeamento de erros `src/transports/cable/erros.ts` (nome do erro + fase →
  `TransportError`; não fatais)
- [x] T008 Leitura da porta `src/transports/cable/serial.ts`: `TextDecoder` em fluxo, erros
  não fatais, `connection-lost`, `timeout` de 15 s, `fechar()` limpo; `tests/cabo-serial.test.ts`
  com porta falsa (acento partido, cabo solto, bytes perdidos, silêncio, porta ocupada,
  defeito em quem recebe a linha)
- [x] T009 Detecção de suporte `src/transports/cable/disponibilidade.ts` (app, navegador de
  celular, endereço não seguro, navegador sem porta serial) + `index.ts`, testada em
  `tests/cabo-serial.test.ts`
- [x] T010 Regra nova em `scripts/check-fronteira.sh`: porta serial só em `src/transports/`
  (conferida por mutação)

**Checkpoint**: lê linhas de uma porta e as interpreta, sem tela.

## Phase 3: User Story 1 — Ver a placa ao vivo (P1) 🎯 MVP

- [x] T011 [US1] Sessão em memória `src/core/bancada/sessao.ts` (última leitura, contagens,
  tetos de 6 h e 50 mensagens; linha com corte nunca vira leitura)
- [x] T012 [US1] Textos da leitura `src/core/bancada/apresentacao.ts` (1 e 0 casas, voláteis
  sem número grande enquanto o gás não está pronto, eCO₂ estimado, estado do gás em palavra)
  e `tests/bancada-mensagens.test.ts`
- [x] T013 [US1] Chaves de i18n no bloco "Frente 004" no fim de `src/core/i18n/pt-BR.ts`
- [x] T014 [US1] Tela `src/app/cabo.tsx`: aviso fixo fora da rolagem, Conectar/Desconectar na
  barra de baixo, números grandes, estado do gás com ícone (`src/ui/IconesCabo.tsx`), aviso
  do aquecimento cruzado, bipe (`src/ui/bipe.ts`)
- [x] T015 [US1] Link no Diagnóstico (`src/app/diagnostico.tsx`) e título da rota
  (`src/app/_layout.tsx`)

## Phase 4: User Story 2 — Últimos minutos e mensagens (P1)

- [x] T016 [US2] Série com lacunas e faixas `src/core/bancada/serie.ts` (valor em branco,
  silêncio > 3 s, status ≠ 0 só nos voláteis; janela de 5 min por busca binária; escala com
  piso) e `tests/bancada-sessao.test.ts`
- [x] T017 [US2] `src/ui/GraficoAoVivo.tsx` com seletor de grandeza na tela
- [x] T018 [US2] Registro das mensagens da placa e das linhas ilegíveis, mais recente em cima,
  com o motivo da ilegível em palavra

## Phase 5: User Story 4 — Onde não dá, dizer o que fazer (P1)

- [x] T019 [US4] Tela sem botão de conectar quando não há suporte, com motivo e alternativa
  (`textoSemCabo` em `src/core/bancada/mensagens.ts`); no app do celular, "Ir para Coletar"

## Phase 6: User Story 5 — Problemas de conexão (P2)

- [x] T020 [US5] Código + fase → problema → título + o que fazer
  (`src/core/bancada/mensagens.ts`); cartão com ícone; sessão preservada; dois bipes ao
  perder a conexão

## Phase 7: User Story 3 — Planilha (P2)

- [x] T021 [US3] `src/core/bancada/csv.ts` (BOM, `;`, vírgula decimal, `\r\n`, proveniência,
  proteção de fórmula) e `tests/bancada-csv.test.ts`
- [x] T022 [US3] `src/ui/baixarArquivo.ts` e botão Salvar o que foi visto, com retorno de
  "baixada" ou "não consegui baixar"

## Phase 8: Polish

- [x] T023 `tests/cabo-fronteira.test.ts`: nada alcançável a partir da tela importa
  `src/data` (Princípio III) nem `src/nuvem`/rede (Princípio I); nenhum texto solto em JSX nos
  componentes da 004; porta serial só em `src/transports/`
- [x] T027 Revisão independente: linha ilegível entre duas leituras quebra o gráfico
  (`depoisDeIlegivel`, hoje `depoisDeOutraLinha`, em `sessao.ts`/`serie.ts`); eCO₂ sem número enquanto o sensor de gás
  não está pronto; status 3/desconhecido não é chamado de "ainda não está pronto"; legenda
  da faixa "sensor de gás não pronto"; significado do `Status` e do `nan` registrados como
  não confirmados em `docs/integracao-firmware.md`
- [x] T028 Segunda revisão independente: mensagem de texto da placa entre duas leituras
  ("Erro na leitura do AHT20 (CRC/timeout)") também quebra o gráfico (`depoisDeOutraLinha`
  em `sessao.ts`/`serie.ts`, `tests/bancada-sessao.test.ts`); a regra da porta serial em
  `scripts/check-fronteira.sh` e `tests/cabo-fronteira.test.ts` passa a pegar
  `(navigator as X).serial`, `nav?.serial` e `navigator['serial']` (conferido por mutação)
- [ ] T024 Verificação manual no Chrome de computador com a placa real: conectar, ver os
  números, desconectar e reconectar, puxar o cabo, abrir a porta na IDE do Arduino antes,
  ligar a placa sem o sensor de gás, salvar a planilha e abrir no Excel e no LibreOffice;
  repetir em modo avião; medir o ritmo real das linhas para rever os 3 s que quebram o
  gráfico (spec, Assumptions) — **pendente: precisa da placa e do João**
- [ ] T025 Abrir a tela no Firefox, no Safari, no Chrome do Android e no app Android e
  conferir que nenhum botão inerte aparece (SC-006) — **pendente: navegador real**
- [ ] T026 Medir no aparelho de referência o arranque a frio com a rota nova (Princípio II) —
  **pendente: aparelho físico**

## Dependencies

- T003–T010 antes de qualquer tela.
- US1 antes de US2 e US3 (mesma tela). US4 e US5 dependem só de T008/T009.
- T024–T026 dependem de tudo e de hardware.

## Análise de consistência (feita à mão, no lugar de `/speckit-analyze`)

- Todo FR tem tarefa: FR-001→T008 · FR-002→T004 · FR-003/004/005→T003 · FR-006→T010 ·
  FR-007→T015 · FR-008/009/010/011→T012/T014 · FR-012→T016/T017 · FR-013→T018 ·
  FR-014→T014 · FR-015→T023 · FR-016→T019 · FR-017→T020 · FR-018→T014/T020 ·
  FR-019/020/021→T021/T022.
- Todo SC tem verificação: SC-002/003→T005 · SC-004→T023 · SC-001/005→T024 · SC-006→T025.
- Conflitos com MUST da constituição: dois, no Princípio IV (carga sem versão; monitor fora
  da interface `Transport`), justificados em plan.md, Complexity Tracking. Nenhum CRITICAL
  sem justificativa.
- Ressalva de processo: esta análise foi feita depois de parte do código existir.
