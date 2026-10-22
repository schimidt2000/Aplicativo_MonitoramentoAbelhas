---
description: "Tarefas da feature 002 — envio para a nuvem e painel das pesquisadoras"
---

# Tasks: Envio para a nuvem e painel das pesquisadoras

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/servidor.md](./contracts/servidor.md)

**Organização**: por fatia vertical do plano aceito (0 a 5), cada tarefa com a história que
atende. `[X]` só quando o entregável **existe no repositório** — conferido no código em
2026-10-21, não na memória de quem fez. Fatia 0 conferida contra os commits `3b9b680` e
`7e424a0`; Fatia 1 é esta frente (`feat/002-servidor`).

## Formato: `[ID] [P?] [História] Descrição`

- **[P]**: pode correr em paralelo (arquivos diferentes, sem dependência)
- **[US1]** enviar · **[US2]** ligar o celular · **[US3]** ver o conjunto ·
  **[US4]** investigar uma colmeia · **[US5]** planilha

---

## Fase 1 — Fatia 0: fundação honesta (entregue em parte)

**Demonstração**: modo avião; "Enviar agora" contra a nuvem simulada; matar em 60% e
retomar sem duplicar nem perder; `npm test` verde.

- [X] T001 [US1] Porta da nuvem com `deviceId`, nunca `node_id` — `src/core/ports/nuvem.ts`
- [X] T002 [US1] Nuvem simulada com falhas injetáveis (sem rede, portal cativo, corte no meio do lote, servidor instável, atraso), chave natural `(deviceId, seq)` — `src/nuvem/mock/cliente.ts`
- [X] T003 [US1] Motor de envio: cadastro antes das leituras, lote por nó, `synced_at` só depois da confirmação e na mesma transação, nenhum DELETE — `src/data/sync.ts`
- [X] T004 [US1] Fila pelo índice parcial `ix_reading_unsynced`; `loteNaoEnviado`, `marcarEnviadas` (único UPDATE, só `synced_at`), `cadastroAlteradoDesde` — `src/data/repo.ts`
- [X] T005 [P] vitest + better-sqlite3 e os primeiros testes (idempotência, envio, retomada) — `vitest.config.mts`, `tests/apoio/banco.ts`, `tests/ingestao.test.ts`, `tests/envio.test.ts`
- [X] T006 [US1] Dois estados distintos e simultâneos ("Salvo no celular" / "Salvo na nuvem") — `src/app/(tabs)/enviar.tsx`, `src/app/(tabs)/index.tsx`
- [X] T007 [US1] "Enviar agora" obrigatório, sempre visível, no terço inferior — `src/app/(tabs)/enviar.tsx`
- [X] T008 [P] Encanamento: Metro ignora `painel/` e `servidor/`, `tsconfig` exclui os dois, scripts do painel — `metro.config.js`, `tsconfig.json`, `package.json`
- [X] T009 [P] Fronteiras por comando (SDK fora de transports/nuvem, UPDATE só em `synced_at`, nada de DELETE em `reading`, painel sem banco, eco2 nunca CO2) — `scripts/check-fronteira.sh`
- [X] T010 Emendas da constituição 1.1.0 (`synced_at`, orçamento do painel, escopo do Princípio V, coordenada, LGPD) — `.specify/memory/constitution.md`
- [x] T011 i18n das cinco telas. Hoje: coletar, ajustes e parte de colmeias migradas; **enviar** migrada por esta frente (T029); o resto está com a frente `fix/001-dividas-de-tela`. *Feita (conferido em 2026-10-22):* o resto veio da frente `fix/001-dividas-de-tela` (`2614cd1`), e `tests/telas.test.ts` reprova texto literal em `src/app` e `src/ui`; a 003 acrescentou o bloco dela em `src/core/i18n/pt-BR.ts`
- [x] T012 Migrações por `user_version` (`src/data/migracoes.ts`) com teste sobre banco populado — **não entregue** na Fatia 0; bloqueia T060. *Feita pela 003* (`34974e0`): `src/data/migracoes.ts`, `tests/migracao.test.ts`
- [ ] T013 `tasks.md` da 001 — **não entregue**
- [X] T014 [P] Glossário: termos do envio ("código do projeto", "ligar o celular ao projeto", projeto, pesquisadora, painel, planilha) e *enviar* como palavra de tela — `docs/glossario.md` (seção da feature 002)

**Checkpoint**: envio de ponta a ponta contra a simulada — atingido. Dívidas T011–T013 abertas (T011 e T012 fechadas depois; ver acima).

---

## Fase 2 — Fatia 1: servidor real, um apicultor (esta frente)

**Demonstração**: digitar o código, enviar, ver as linhas no editor do Supabase; enviar de
novo e a contagem não se move. **Sem conta de nuvem ainda**: a demonstração roda contra
o Postgres descartável (`npm run servidor:teste`) e contra o Supabase falso dos testes.

### Servidor

- [X] T020 [US1][US2] Esquema: pessoas, código (só hash + pepper gerado no banco), cadastro com chave composta, `reading` com chave `(device_id, seq)`, gatilho append-only (vale até para o dono), `reading_daily` e `node_stats` por gatilho de comando, sem coluna de coordenada — `servidor/001_schema.sql`
- [X] T021 [US2][US3] Acesso: RLS em toda tabela, privilégios revogados POR ÚLTIMO, sem política de UPDATE/DELETE em `reading`, `redeem_project_code` (limite 5/h, trava 10/24 h, teto global), `upsert_registry` (última escrita vence), `issue_project_code`, visões `hive_overview`/`hive_daily`/`hive_reading` — `servidor/002_rls.sql`
- [X] T022 [P] Semente de demonstração sem pessoa real: dois projetos, três apicultores, códigos conhecidos, 30 dias com lacuna, só-gás-inválido e troca de sensor — `servidor/003_seed.sql`
- [X] T023 [P] Apagamento LGPD fora de banda: `private.erase_beekeeper` + registro sem dado pessoal + procedimento com confirmação — `servidor/004_lgpd.sql`, `servidor/lgpd/apagar-apicultor.sql`
- [X] T024 Teste do servidor num Postgres descartável: caso de referência, NEGAÇÃO (A recebe zero linhas de B; pesquisadora de outro projeto recebe zero), append-only, limite de tentativas, LGPD, esquema e privilégios, reaplicação — `servidor/teste/`
- [X] T025 [P] Casos de referência compartilhados celular ↔ servidor — `servidor/golden/codigos.json`, `servidor/golden/resumo-diario.json`, `tests/codigo-projeto.test.ts`, `tests/resumo-golden.test.ts`

### App de campo

- [X] T026 [US2] Código do projeto: base32 de Crockford, Luhn mod 32, leituras toleradas (O→0, I/L→1), formatação enquanto digita — `src/core/codigo-projeto.ts`
- [X] T027 [US1][US2] Cliente real por `fetch` atrás da mesma porta: sessão anônima e renovação, resgate, cadastro, leituras com `ignore-duplicates`, só 201 confirma, guarda de portal (camadas 2 e 3), zod em toda resposta — `src/nuvem/supabase/`
- [X] T028 [US1] Configuração por `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`; recusa chave de serviço e http; registro escolhe a simulada sem configuração — `src/nuvem/config.ts`, `src/nuvem/index.ts`
- [X] T029 [US2] Tela "Ligar o celular ao projeto" (validação local antes da rede, textos via i18n, código de demonstração só no modo simulado) e `enviar.tsx` migrada para i18n, levando a ela — `src/app/vincular.tsx`, `src/app/(tabs)/enviar.tsx`, `src/core/envio/mensagens.ts`, `src/core/i18n/pt-BR.ts`
- [X] T037 [P] Testes do cliente com `fetch` falso e de ponta a ponta com o motor de envio — `tests/nuvem-supabase.test.ts`, `tests/nuvem-config.test.ts`, `tests/envio-mensagens.test.ts`, `tests/apoio/supabase-falso.ts`
- [X] T038 [P] Encanamento conferido por teste (Metro ancorado na raiz, `tsconfig`, vitest, sem `@supabase/*` no app) e `check:fronteira` ampliado (SDK do Supabase, chave embutida, coordenada e política de UPDATE/DELETE no servidor, conferido por `tests/fronteira-servidor.test.ts`); scripts `servidor:teste`, `painel:test` — `tests/encanamento.test.ts`, `scripts/check-fronteira.sh`, `metro.config.js`, `package.json`
- [ ] T030 [US2] Instalar `expo-secure-store` (`npx expo install`, versão exata no plan.md) e implementar `Cofre` protegido (FR-015). Hoje a sessão fica em memória
- [ ] T031 [US1] Instalar `expo-network` e ligar `sondaDeRede` (`isInternetReachable`, camada 1 da guarda de portal)
- [ ] T032 Criar o projeto Supabase em `sa-east-1` (depende da decisão de hospedagem): anonymous sign-ins, limite por IP, scripts 001/002/004, pesquisadora — `quickstart.md` §3
- [ ] T033 [US1][US2] Demonstração da Fatia 1 contra o Supabase real (enviar duas vezes, contagem igual)
- [ ] T034 [US1] Teste em modo avião no aparelho (Enviar e Ligar), relatado no PR
- [ ] T035 `/speckit-clarify`: código "de uso único" × reinstalação e segundo celular (research.md R-004)
- [ ] T036 [US1] Reiniciar o cursor do cadastro quando o vínculo muda de apicultor (achado A-5) — `src/data/sync.ts`

**Checkpoint**: servidor e cliente prontos e testados sem conta; falta só a nuvem existir.

---

## Fase 3 — Fatia 2: o painel existe (frente do painel)

- [x] T040 [US3] Painel Vite: entrar (sem cadastro público), visão do conjunto a partir de `hive_overview` — `painel/` (frente `feat/002-painel`, P001–P008 de `painel-plano.md`). *Feita:* P008 de `painel-plano.md`
- [x] T041 [US3] Alinhar `painel/src/dados/contrato.ts` com `contracts/servidor.md` (`hive_overview`, `hive_daily`, `hive_reading`; colmeia = `(beekeeper_id, hive_id)`)
- [ ] T042 [P] Job de CI do painel e verificação "sem banco local" (FR-032). *Parcial:* o script existe (`painel/scripts/check-sem-banco.sh`, `npm run check:sem-banco`), o CI não. Job `painel` escrito em `.github/workflows/ci.yml` (2026-10-22), **ainda não executado**

## Fase 4 — Fatia 3: gráficos e período

- [x] T050 [US4] uPlot com lacuna por calendário, quebra na troca de `sensor_epoch`, excluídas ao lado de cada agregado, voláteis só relativos à própria colmeia. *Feita:* P009 de `painel-plano.md`
- [ ] T051 [US4] Medir gráfico p95 ≤ 1,0 s contra servidor semeado com 30 colmeias × 12 meses

## Fase 5 — Fatia 4: planilha

- [x] T055 [US5] Planilha sob demanda de `hive_reading`: UTF-8 com BOM, `;`, vírgula decimal, cabeçalho de proveniência (eCO₂ derivado, excluídas, sem coordenada); recorte grande pede para estreitar. *Feita:* P010 de `painel-plano.md`
- [ ] T056 [US5] Medir: 50 mil linhas começam a baixar em ≤ 3 s

## Fase 6 — Fatia 5: campo de verdade

- [ ] T060 [US1] Corrigir A-1: `reading_daily` do celular com chave `(node_id, day, sensor_epoch)` por migração (depende de T012); trocar o `it.fails` de `tests/resumo-golden.test.ts` por comparação com o servidor. *Desbloqueada pela 003* (T012 feita)
- [ ] T061 [US1] Lote adaptativo que sobrevive entre tentativas e backoff com jitter total de fato aplicado (`atrasoDeRetentativa` existe e não é usado) — achado A-4
- [ ] T062 [US1] Nó recusado para sempre não bloqueia os outros nós — achado A-4
- [ ] T063 [US2] Teste de negação com dois apicultores no Supabase real, por HTTP (repete `servidor/teste/rls.sql` pela API)
- [ ] T064 [US1] 100 mil leituras em EDGE, com portal cativo e interrupções, no aparelho de referência: nada perdido, nada duplicado (SC-006)
- [ ] T065 Arranque a frio p50/p95 e PSS com o cliente real; re-ratificação do Princípio II
- [ ] T066 [P] Nuvem simulada com 401 e 409 injetáveis (o plano pedia; hoje só o Supabase falso dos testes cobre)
- [ ] T067 [P] Manter o projeto acordado (Action a cada 3 dias), runbook com "confira isto PRIMEIRO", `pg_dump` semanal fora do repositório
- [ ] T068 [P] Rodar `npm run servidor:teste` no CI (job com Postgres). Job `servidor` escrito em `.github/workflows/ci.yml` (2026-10-22), **ainda não executado**
- [ ] T069 `/speckit-analyze` sobre spec, plano e tarefas da 002 quando `feature.json` apontar para ela
- [ ] T071 [US1][US2] Contraste do botão primário: rótulo branco sobre `cores.acento` (#8A5A00) dá 5,93:1, abaixo de 7:1 (Princípio V). Escurecer o token e corrigir o comentário dele, com a frente `fix/001-dividas-de-tela` — `src/ui/tokens.ts`
- [ ] T072 [US1] Trilha B por tabela `outbox` (regra de `sync.md`) no lugar do cursor por relógio do celular — achado A-8 — `src/data/sync.ts`, `src/data/repo.ts`
- [ ] T070 Achado A-2: renomear `temp_p5`/`temp_p95` ou calcular percentis de verdade, nos dois lados e no caso de referência

---

## Dependências

- T020 → T021 → T022/T023 → T024. T025 depende de T020 e do celular (já existia).
- T026 → T029. T027 → T028 → T029.
- T030, T031 não bloqueiam nada desta fatia (encaixes já existem).
- T032 → T033, T063, T064. T012 → T060.
- Fatias 2–4 dependem só de `servidor/*.sql` (o contrato), não do app.
