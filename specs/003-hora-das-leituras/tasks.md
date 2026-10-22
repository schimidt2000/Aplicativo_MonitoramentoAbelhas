---
description: "Tarefas da feature 003 — hora confiável das leituras"
---

# Tasks: Hora confiável das leituras

**Input**: `specs/003-hora-das-leituras/` — spec.md, plan.md, research.md, data-model.md

**Tests**: pedidos pela própria spec (SC-001, SC-002, SC-004, SC-005) e pela constituição
(migração com banco populado). Escritos junto com o código; os pontos críticos têm teste por
mutação (quebrar de propósito, ver o teste falhar, restaurar).

## Format: `[ID] [P?] [Story] Descrição`

---

## Phase 1: Setup

- [x] T001 Plano, pesquisa, modelo de dados e tarefas em `specs/003-hora-das-leituras/`
- [x] T002 `.specify/feature.json` aponta para `specs/003-hora-das-leituras` (já apontava)

---

## Phase 2: Foundational — banco versionado (bloqueia tudo)

- [x] T003 `src/data/migracoes.ts`: lista de migrações, `versaoDoBanco`, `migrar` (uma
  transação por versão, terminando em `PRAGMA user_version`), `prepararBanco`
- [x] T004 Migração 2: reconstrução de `reading` com guarda de contagem e `EXCEPT`;
  reconstrução de `clock_anchor` com `id`; tabelas `referencia_revogada`, `hora_decisao`,
  `hora_versao`, `hora_correcao`; VIEW `leitura_hora`
- [x] T005 [P] `db.native.ts`, `db.web.ts` e `tests/apoio/banco.ts` chamam `prepararBanco`
- [x] T006 [P] `tests/apoio/bancoSqlJs.ts`: o mesmo `SqlDb` sobre sql.js em Node
- [x] T007 `tests/migracao.test.ts`: banco populado na versão 1 → versão 2 sem perder nem
  alterar linha (better-sqlite3 e sql.js); migrar duas vezes é sem efeito; migração que
  falha desfaz tudo; banco novo nasce na versão 2

**Checkpoint**: banco versionado; nenhuma regra de hora ainda.

---

## Phase 3: User Story 1 — nenhuma hora errada com selo de certa (P1) 🎯 MVP

- [x] T008 [US1] `src/core/hora/tipos.ts` e `avaliar.ts`: segmentação em ligadas (número do
  nó, regressão `≤`, troca de modo), atribuição das referências por `seq_ref` (D-305),
  faixas pela referência mais próxima (FR-005), modos `uptime`/`rtc`/`none` (FR-008)
- [x] T009 [US1] `ingerirLote` grava hora "em avaliação" (NULL, 3, `em-avaliacao`),
  `boot_no` e `clock_mode`; `boot_id` NULL
- [x] T010 [US1] `src/data/hora.ts`: carregar leituras e referências, avaliar, gravar versão
  só quando muda, refazer resumos (`atualizarHoras`)
- [x] T011 [US1] `ingest.ts`: resumos pela VIEW, sem hora desconhecida (FR-017)
- [x] T012 [US1] `repo.ts`: última leitura, mais antiga pendente, lote de envio e exportação
  pela VIEW; `contarSemHora`
- [x] T013 [US1] Mock: `perdeuEnergiaEm`/`perdeuEnergiaEmMs` (contador recomeça, `seq` salta
  64); linha do tempo fixa (`ligadoEmMs`, relógio real separado do celular)
- [x] T014 [US1] `tests/hora.test.ts`: ligadas por regressão e por número; FR-003; SC-001
  com dois reinícios; leituras de ligada já conferida recebem a hora dela (US1-2)
- [x] T015 [US1] `tests/hora-coleta.test.ts`: coleta com perda de energia ponta a ponta;
  reinício detectado contra a última leitura da coleta anterior (US1-4)

---

## Phase 4: User Story 2 — celular com a data errada (P1)

- [x] T016 [US2] Conferência entre coletas com tolerância 10 min + 1 % do tempo do nó;
  ordem entre ligadas (FR-009, D-306); estados não conferida / conferida / em conflito
- [x] T017 [US2] Acerto bem-sucedido vira referência do mesmo grupo (FR-006)
- [x] T018 [US2] `coleta.ts`: referência gravada antes do envio; decisão de envio com
  hipótese pela última leitura (D-307); conflito → não envia; `adiado` quando a dúvida se
  desfaz depois da transferência
- [x] T019 [US2] `hora.ts` (`registrarResposta`) e `coleta.ts` (`responderPerguntaDeHora`,
  `responderPergunta`): "Sim" grava decisão, revoga as discordantes, reavalia e religa ao nó
  para acertar; "Não" só grava (FR-011, FR-013)
- [x] T020 [US2] `resultado.ts`/`mensagens.ts`: estados `conflito` e `adiado`;
  `perguntaDeHora`
- [x] T021 [US2] `src/ui/PerguntaHora.tsx` e o encaixe em `coletar.tsx`: data e hora em
  destaque, "Sim, está certa" / "Não", alvo ≥ 56 dp
- [x] T022 [US2] Textos no bloco "Frente 003" de `pt-BR.ts`
- [x] T023 [US2] Testes: SC-002 (adiantado um ano → certo → "Sim" → terceira coleta acerta,
  com e sem alcançar o nó no "Sim"); "Não" não muda nada e a pergunta volta; data antes do
  projeto continua não sendo enviada (US2-4)

---

## Phase 5: User Story 3 — leituras sem hora calculável (P2)

- [x] T024 [US3] Mock `semNocaoDeTempo`: contador 0, `clockMode: 'none'`; referência da
  coleta guardada e rejeitada
- [x] T025 [US3] Teste: modo sem noção de tempo dá hora em branco com motivo, nenhuma hora
  inventada, fora do resumo (SC-004)
- [ ] T026 [US3] Planilha com as leituras sem hora e a contagem no cabeçalho (US3-2) — a
  planilha não existe no app de campo; depende da 002 (ver T043)

---

## Phase 6: User Story 4 — o grau de certeza visível (P2)

- [x] T027 [US4] `leiturasParaExportar` traz qualidade e motivo efetivos; `contarPorQualidade`
- [x] T028 [US4] Palavras "ancorada", "estimada", "desconhecida" no i18n
- [x] T029 [US4] Detalhe da colmeia: "N leituras sem hora conhecida ficaram fora do gráfico"
  (FR-017), em tom neutro (FR-020)

---

## Phase 7: User Story 5 — corrigir depois, sem reescrever (P3)

- [x] T030 [US5] Reavaliação de tudo o que já estava gravado, dentro da migração (FR-015)
- [x] T031 [US5] SC-005: revogar e recalcular deixa `reading` idêntica campo a campo; a VIEW
  mostra a hora nova e o motivo
- [x] T032 [US5] A primeira referência promovida a conferida pela segunda coleta muda a
  qualidade das leituras da primeira por correção à parte

---

## Phase 8: Demonstração e documentação

- [x] T033 [P] Ajustes: "O sensor ficou sem energia e religou", "O sensor não sabe contar o
  tempo", "A data do celular está um ano adiantada"
- [x] T034 [P] Semente de demonstração coerente com a linha do tempo do mock (sem conflito
  falso no dia seguinte)
- [x] T035 [P] `docs/integracao-firmware.md`: suposições do número da ligada e da tolerância;
  resumo de como o app trata a hora
- [x] T036 [P] `contracts/transport.md` da 001: adendo do campo `ligada` e do acerto pelo
  "Sim"
- [x] T037 [P] `quickstart.md` desta feature
- [x] T038 Testes antigos que esperavam "ancorada" na primeira coleta ou `voltou-no-tempo`
  como suspeita, atualizados com a justificativa (D-301, D-306)
- [x] T039 Teste por mutação nos pontos críticos: regressão `≤`, borda da tolerância,
  tolerância medida pelo celular em vez do nó, filtro de hora desconhecida no resumo, cópia
  da migração perdendo `synced_at` (com e sem a guarda), sinal da conta na VIEW, ramo de
  reinício da FR-003, "Sim" sem revogar, envio sem checar conflito, hora provisória na
  ingestão, primeira referência tratada como conferida, semente fora da linha do tempo e a
  falta de energia da demonstração que não persiste. Todas pegas pelos testes.
- [x] T048 Falta de energia da demonstração guardada nos ajustes (vale depois de reabrir o
  app), e `tests/hora-demo.test.ts`: semente + primeira coleta sem conflito falso

---

## Phase 9: Pendências (não feitas nesta entrega)

- [ ] T040 Conferir no app de campo no navegador: a pergunta de hora (alvos, contraste, modo
  sol, fonte em 200 %) e as três demonstrações novas
- [ ] T041 Medir a avaliação das horas no aparelho de referência (Princípio II). Hoje só há
  número de Node (MacBook), `tests/hora-desempenho.test.ts`, 10.000 leituras, 20 coletas,
  um reinício: avaliar + gravar versão + refazer resumos **15 ms** (better-sqlite3) e
  **45 ms** (sql.js); lista de colmeias 15 ms / 29 ms; lote de envio de 500, 1 ms / 4 ms.
  O resumo pela VIEW custa ~19 ms em sql.js contra ~10 ms do resumo antigo direto em
  `reading`. Num Snapdragon 425 o fim da coleta pode passar de 100 ms por colmeia: se a
  medição confirmar, avaliar só a partir da ligada mais antiga tocada e refazer só os dias
  afetados
- [ ] T042 Teste em modo avião no aparelho, relatado no PR
- [ ] T043 Planilha: qualidade em palavra por linha e contagens no cabeçalho (FR-018,
  SC-003) — frente da 002
- [ ] T044 Gráfico: trecho de hora estimada diferente do ancorado sem depender só da cor
  (FR-019)
- [ ] T045 SC-006: três pessoas sem instrução diante do aviso de conflito
- [ ] T046 Nuvem: correção de hora feita depois do envio não sobe; o servidor precisa aceitar
  `t_utc_ms` nulo (frente da 002/servidor)
- [ ] T047 Lista de colmeias: a urgência de coleta usa a hora da última leitura com hora
  conhecida; para um nó só com leituras sem hora, deveria usar a hora da última coleta

---

## Dependencies & Execution Order

- Phase 2 bloqueia tudo (o esquema novo é pré-requisito da VIEW e das referências).
- US1 (Phase 3) antes de US2: a conferência usa a atribuição de referências.
- US3–US5 dependem de US1; US5 (T030) depende da migração.
- Phase 8 depois das histórias.
