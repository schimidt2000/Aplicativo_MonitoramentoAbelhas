---
description: "Tarefas da feature 005 — coleta real pelo cabo com o protocolo do firmware"
---

# Tasks: Coleta real pelo cabo, com o protocolo do firmware

**Input**: `specs/005-coleta-pelo-cabo/` — spec.md, plan.md, research.md, data-model.md,
contracts/

**Tests**: pedidos explicitamente (SC-001 a SC-004, INV-501 a INV-507 e a regra de teste por
mutação nos pontos críticos). Cada teste crítico é quebrado de propósito uma vez para conferir
que pega (lista em plan.md, "Verificação").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: história da spec (US1…US6)

## Phase 1: Setup

- [x] T501 Criar `specs/005-coleta-pelo-cabo/` (spec, checklist) e apontar
  `.specify/feature.json` para a 005
- [x] T502 Emendar a FR-016 (e anotar a FR-008) da 003, com justificativa nas Clarifications
- [x] T503 Plano, research (D-501–D-518), data-model, contracts, quickstart, tasks
- [x] T504 `docs/integracao-firmware.md` (confirmado com data e commit, dependência do grupo de
  armazenamento, riscos, pedidos), `docs/mensagem-firmware-2026-10-21.md`, "placa" no glossário

## Phase 2: Foundational (bloqueia todas as histórias)

- [x] T505 [P] CRC-32/ISO-HDLC puro e incremental `src/core/cabo/crc32.ts` +
  `tests/crc32.test.ts` (vetores conhecidos, incremental = inteiro)
- [x] T506 [P] Leitor `arquivo-0` + tabela `formato → leitor` + chave + codificador para teste
  `src/core/decode/arquivo.ts` + `tests/arquivo0.test.ts` (exemplo do contrato byte a byte,
  as cinco recusas, NaN → NULL com motivo, bruto preservado)
- [x] T507 `Reading.tempBruto/rhBruto`, `clockMode: 'contagem'` em `src/core/ports/transport.ts`
- [x] T508 [P] Leitor de bytes linha/N bytes `src/transports/cable/entrada.ts` +
  `tests/cabo-entrada.test.ts` (FILE_INFO e binário no mesmo pedaço, pedaço de 1 byte, CR,
  linha longa, prazo, queda)
- [x] T509 Placa simulada fiel ao `.ino` `src/transports/mock/firmware.ts` +
  `tests/firmware-simulado.test.ts` (diagnósticos, cada `ERROR:*`, primeiro boot, botão sem
  coleta, falta de energia, arquivo vazio, CRC errado, cabo puxado)
- [x] T510 [P] Linhas do protocolo e diagnósticos `src/core/cabo/linhas.ts` (READY com MAC,
  FILE_INFO com intervalo, ERROR:*, protocolo desconhecido)
- [x] T511 Porta `CanalSerial` `src/core/ports/canal.ts`
- [x] T512 Máquina de estados da coleta `src/core/cabo/protocolo.ts` +
  `tests/protocolo.test.ts` (caminho feliz, cada ERROR:*, cada prazo, reenvio de HELLO,
  gravar antes de RECEIVED, hora implausível não enviada, INV-504)
- [x] T513 Máquina de estados da placa nova `src/core/cabo/placaNova.ts` (no mesmo teste)
- [x] T514 Executor das ações sobre a porta `src/core/cabo/sessao.ts`

**Checkpoint**: a conversa inteira roda contra a placa simulada, sem banco.

## Phase 3: User Story 2 — Hora estimada só quando a conta fecha (P1)

- [x] T515 [US2] Migração 3 `src/data/migracoes.ts` (colunas novas, VIEW com
  `ms_por_unidade`) + `tests/migracao.test.ts` com banco populado (INV-507)
- [x] T516 [US2] Hora por contagem pura `src/core/hora/contagem.ts` +
  `tests/hora-contagem.test.ts` (no ritmo, a mais, a menos, sem conferência, início
  implausível, várias coletas do mesmo arquivo, intervalo do FILE_INFO, INV-505)
- [x] T517 [US2] Partição por modo em `avaliarHoras`; `Faixa.msPorUnidade`; `data/hora.ts`
  sem depender de coluna da v3 durante a v2 (D-518)
- [x] T518 [US2] Intervalo da placa no cadastro (`repo.ts`) com recálculo das horas (INV-506)

## Phase 4: User Stories 1, 3, 4 — Coletar sem perder nada (P1, P2)

- [x] T520 [US1] Ingestão sem transação própria, com os brutos, em blocos (`src/data/ingest.ts`)
- [x] T521 [US1] `src/data/coletaCabo.ts`: gravar sessão + bruto + leituras + referência +
  horas numa transação, `persist()`, só então `gravou` (INV-503)
- [x] T522 [US1] Decidir a hora (plausível ou não) e registrar o acerto
- [x] T523 [US4] Identidade: MAC conhecido, MAC novo, escolha da colmeia, nó novo
- [x] T524 [US3] Desfecho → `ResultadoNo` (problema, relógio, `cabo`), sessão atualizada
- [x] T525 [US1][US3][US4] `tests/cabo-ponta-a-ponta.test.ts`: placa simulada + máquina +
  executor + banco + hora — sucesso, cada erro, durabilidade antes do RECEIVED, reimportação
  (INV-501, INV-502), placa nova, MAC

## Phase 5: User Stories 5, 6 e a tela (P2, P3)

- [x] T530 Extrair `src/ui/ResultadoDaColeta.tsx` de `coletar.tsx`, sem mudar comportamento
- [x] T531 [US3] Textos do cabo `src/core/cabo/mensagens.ts` + avisos em
  `core/coleta/mensagens.ts` + `tests/cabo-mensagens.test.ts` (cada desfecho com o que fazer,
  sem jargão, sem código cru)
- [x] T532 Bloco "Frente 005" em `src/core/i18n/pt-BR.ts`
- [x] T533 Web Serial `src/transports/cable/coleta.ts` (porta autorizada, `connect`, escolher,
  abrir 115200 8N1, canal, fechar) + testes com porta falsa
- [x] T534 [US1] Tela `src/app/coleta-cabo.tsx` (colmeia, passos, contagem, progresso,
  resultado, sem suporte, placa simulada)
- [x] T535 [US5] Tela `src/app/placa-nova.tsx`
- [x] T536 [US6] Links (Coletar, Diagnóstico, rotas) e intervalo da placa em
  `src/app/colmeia/[id].tsx`

## Phase 6: Fronteiras e desempenho

- [x] T540 Regra nova em `scripts/check-fronteira.sh`: `src/core` sem `react-native`,
  `@/transports` nem `@/data` (conferida por mutação)
- [x] T541 `tests/cabo-coleta-fronteira.test.ts` (telas novas sem rede; porta só em
  transports; data/coletaCabo sem transports)
- [x] T542 `tests/cabo-desempenho.test.ts` (ler e gravar 10.000 leituras)

## Phase 7: Verificação

- [x] T543 `npm run typecheck`, `npx vitest run`, `npm run check:fronteira` verdes
- [x] T544 Teste por mutação nos pontos críticos (lista em plan.md)
- [ ] T545 Teste em modo avião e a tela num Chrome real — **parcial (2026-10-22):** a
  exportação web (`expo export`) servida em `127.0.0.1` foi aberta no Chromium do painel do
  app: coleta com a placa simulada (37 leituras, hora estimada), troca do intervalo na tela da
  colmeia (2 h → 1 h deixa as 37 sem hora; de volta a 2 h, voltam) e Configurar placa nova
  simulada, sem erro no console e sem nenhuma requisição fora de `127.0.0.1`. **Falta:** o
  teste em modo avião de verdade (rede desligada) e a Web Serial com a placa
- [ ] T546 Sessão com a placa real (reset ao abrir a porta, porta que some, tempo acordado,
  deriva) — **precisa da placa e do grupo do firmware**

## Phase 8: Achados da revisão (2026-10-22)

- [x] T547 Demonstração: "queda" cortava o cabo em 200 bytes fixos e nunca acontecia depois
  da primeira coleta (arquivo de 24 bytes). Corte na metade do arquivo
  (`caboPuxadoNaFracao`) + `tests/cabo-demo.test.ts` usando a placa como a tela usa
- [x] T548 Resultado com placa sem arquivo (placa nova ou que perdeu o arquivo) oferece
  "Configurar placa nova" direto (FR-025, `pedeConfigurarPlacaNova`)
- [x] T549 Sem cabo e sem demonstração, a tela não mostra a escolha de colmeia (nada a fazer
  com ela) — só a explicação do caminho (FR-032)

## Dependencies & Execution Order

- Fase 2 bloqueia tudo. T512 depende de T510 e T505; T514 de T511 e T512; T509 de T506 e T505.
- Fase 3 depende de T506 (chave) e T507. Fase 4 depende das Fases 2 e 3.
- Fase 5 depende da Fase 4 (resultado) e de T533 para a tela real; a tela com a placa simulada
  só precisa da Fase 4.
