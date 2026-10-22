# Implementation Plan: Envio para a nuvem e painel das pesquisadoras

**Branch**: `feat/002-servidor` (frente do servidor e do envio real; a feature é
`002-envio-e-painel`) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-envio-e-painel/spec.md` e o plano aceito pelo dono do produto em
2026-09-16 (Supabase em `sa-east-1`, código do projeto sem senha, RLS, painel separado,
fatias verticais 0 a 5). Aquele plano vive fora do repositório
(`~/.claude/plans/`, ignorado pelo git); o que ele decidiu está incorporado aqui e em
[research.md](./research.md), com os desvios marcados.

**Escopo desta frente**: Fatia 1 inteira (servidor, cliente real, ligar o celular ao
projeto) e o encanamento do repositório. As Fatias 2 a 4 são da frente do painel
(`feat/002-painel`, [painel-plano.md](./painel-plano.md) quando as frentes se juntarem);
a Fatia 5 fica registrada em [tasks.md](./tasks.md). **Nada foi implantado**: não existe
conta de nuvem, e a hospedagem ainda não foi decidida formalmente.

## Summary

As leituras saem do celular e chegam às pesquisadoras. O servidor é **Postgres puro**
(`servidor/001`–`004`), escrito para rodar num Supabase em `sa-east-1` e testado num
Postgres descartável (`npm run servidor:teste`). A garantia de append-only e a separação
entre apicultores são **propriedade do banco**: sem política de UPDATE/DELETE em `reading`,
gatilho que barra até o dono do banco, RLS negando por padrão, e um teste de **negação**
(o celular de A recebe zero linhas de B). O resumo diário é recalculado no servidor pela
mesma regra do celular, e um **caso de referência** compartilhado
(`servidor/golden/`) prova que os dois lados dão os mesmos números.

No app de campo, o cliente real (`src/nuvem/supabase/`) fala `fetch` puro, valida toda
resposta com zod e fica atrás da mesma porta que a nuvem simulada; sem configuração, o
registro escolhe a simulada. O apicultor liga o celular ao projeto digitando uma vez o
**código do projeto** (`XXXX-XXXX`, base32 de Crockford com dígito verificador), conferido
no aparelho antes de qualquer rede.

## Technical Context

**Language/Version**: TypeScript 6.0 (app de campo, Expo SDK 57, React Native 0.86);
SQL/PL/pgSQL para Postgres 15+ (testado no 17.10).

**Primary Dependencies**: nenhuma nova no app de campo. Usa `fetch` (da plataforma) e
`zod` 4.6.1 (já dependência). No servidor, só o que o Postgres traz (`sha256`,
`gen_random_uuid`, sem extensão) e o esquema `auth` do Supabase.

**Storage**: SQLite no celular (inalterado; `synced_at` já existia). Postgres no servidor.

**Testing**: vitest + better-sqlite3 (app); `servidor/teste/rodar.sh` (Postgres
descartável, socket local, sem rede).

**Target Platform**: Android 8+ (app de campo); app de campo no navegador (demonstração);
Supabase `sa-east-1` (servidor, não implantado).

**Project Type**: app móvel offline-first + serviço de dados gerenciado + painel separado.

**Performance Goals**: orçamento da constituição (Princípio II). Nenhum número medido
nesta fatia — ver Constitution Check.

**Constraints**: offline por padrão; nada de SDK pesado no celular; nenhuma credencial
administrativa no app; nenhuma coordenada no servidor; logs sem dado pessoal.

**Scale/Scope**: ~30 colmeias × 12 meses × 1 leitura/15 min ≈ 1 milhão de linhas/ano;
o teto gratuito de 500 MB cabe ~55 colmeias-ano (plano aceito).

## Constitution Check

*Reavaliado depois do desenho (Fase 1). Evidência = arquivo que existe neste branch.*

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS (código e testes); teste em modo avião no aparelho **pendente** | Tabela Comportamento Offline abaixo. Só `enviar.tsx` e `vincular.tsx` importam `@/nuvem` (coleta não depende de rede). Sem rede vira `sem-rede`, tom neutro, nada marcado: `tests/nuvem-supabase.test.ts` ("sem resposta nenhuma…", "portal cativo: nada é marcado"), `tests/envio-mensagens.test.ts` (sem "erro/falha/offline"). Modo avião em aparelho físico: T034. |
| II. Orçamento de Desempenho | VIOLAÇÃO (não medido) | Nenhum p50/p95 nem PSS medido com o cliente real. Zero dependência nova no app (`tests/encanamento.test.ts` reprova `@supabase/*` no `package.json`). Ver Complexity Tracking. Medição: T065. |
| III. Leituras Imutáveis e Idempotentes | PASS | Servidor: chave `(device_id, seq)`, sem política de UPDATE/DELETE e gatilho append-only (`servidor/001_schema.sql`, `002_rls.sql`), conferidos em `servidor/teste/esquema.sql`; reenvio não cria linha e não muda resumo (`servidor/teste/golden.sql`, `rls.sql`). Celular: `tests/envio.test.ts`, `tests/nuvem-supabase.test.ts` ("a conexão cai DEPOIS de o servidor gravar…"). Só 201 confirma um lote. `check:fronteira` reprova política em `reading` que não seja FOR SELECT/INSERT (inclusive sem FOR, que vale para ALL) e coluna de coordenada, provado por `tests/fronteira-servidor.test.ts`. |
| IV. O Payload é Externo | PASS | O envio não toca payload: sobe o modelo canônico já decodificado. Porta `src/core/ports/nuvem.ts`; nuvem simulada entregue antes da real; registro `src/nuvem/index.ts` é o único lugar que escolhe. Matriz de Capacidades abaixo. |
| V. Ergonomia de Campo em pt-BR | VIOLAÇÃO (contraste do botão primário) | Chaves `envio.*` e `vinculo.*` em `src/core/i18n/pt-BR.ts` (bloco da frente); `enviar.tsx` migrada para i18n. Alvos ≥ 56 dp (`alvo.minimo`), corpo ≥ 16 sp, ação primária no terço inferior. Vocabulário: "código do projeto", "ligar o celular ao projeto"; `tests/envio-mensagens.test.ts` reprova login/senha/token/subir. **Contraste medido (WCAG, revisão de 2026-10-21):** o rótulo branco do botão primário sobre `cores.acento` (#8A5A00) dá **5,93:1**, abaixo dos 7:1 exigidos para texto primário (o comentário do token diz 6,5:1); o botão secundário (acento sobre `fundo`) dá 5,44:1. Vale para Enviar e Ligar o celular, e para as outras telas que usam o token. Tela em 200% não verificada. Ver Complexity Tracking; T071. |
| VI. Honestidade do Dado | PASS nesta frente; achado A-1 aberto no celular | Mesmo resumo nos dois lados: `servidor/golden/resumo-diario.json` + `tests/resumo-golden.test.ts` + `servidor/teste/golden.sql`. Dia só com gás inválido não gera linha (lacuna). `hive_overview` sem coluna de voláteis (FR-031, conferido em `rls.sql`). `excluded_count` em resumo e visão. A-1 (troca de época no meio do dia quebra o recálculo do CELULAR) documentado por `it.fails`, correção em T060. |
| VII. Especificação Antes do Código | VIOLAÇÃO (processo) | `spec.md` e este plano existem e entram no histórico antes do código desta frente. Mas `/speckit-analyze` **não** foi executado: `.specify/feature.json` aponta para a 003 neste branch e é de outras frentes. Ver Complexity Tracking e a Análise manual abaixo; T069. |

## Comportamento Offline

| Tela/Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Enviar (abrir a aba) | Mostra "Salvo no celular" e "Salvo na nuvem" do SQLite. Nenhum pedido de rede no render. | Igual | SQLite local |
| Enviar agora | Para em `sem-rede` antes de qualquer gravação; aviso neutro "Sem internet agora" com o que fazer; nenhuma leitura marcada | Lote só é marcado depois de 201; queda devolve motivo e a próxima vez retoma pelo índice de não enviadas; reenvio absorvido pela chave natural | SQLite → nuvem |
| Enviar agora sem vínculo | Leva à tela Ligar o celular (US2-1) | Igual | — |
| Ligar o celular: conferir o código | Funciona: dígito verificador no aparelho | Igual | Texto digitado |
| Ligar o celular: resgatar o código | "Sem internet agora"; nada guardado; nenhuma tentativa gasta | Prazo esgotado vira `tempo-esgotado`; tentar de novo | Servidor (`redeem_project_code`) |
| Colmeias, Coletar, Ajustes, Diagnóstico | Inalteradas; não importam `@/nuvem` | — | SQLite / transporte |

## Matriz de Capacidades (nuvem)

O Princípio IV pede a matriz quando o plano toca conectividade. Aqui a conectividade é a
da nuvem, não a de transporte; a matriz de transporte da 001 não muda.

| Peça | Android | iOS | App de campo no navegador |
|---|---|---|---|
| Nuvem simulada | suportado | descopado | suportado |
| Nuvem real (`fetch` → Supabase) | suportado, **não verificado em aparelho** | descopado | suportado (o Supabase responde CORS), **não verificado** |
| Guarda de portal, camada 1 (`isInternetReachable`) | **pendente** (expo-network, T031); hoje só camadas 2 e 3 | descopado | não existe (`navigator.onLine` não valida internet): camadas 2 e 3 |
| Cofre protegido da sessão (FR-015) | **pendente** (expo-secure-store, T030); hoje em memória | descopado | não existe no navegador: memória |

Onde a peça não existe, a UI não oferece botão inerte: a sessão em memória só custa pedir
o código de novo depois de fechar o app.

## Project Structure

### Documentation (this feature)

```text
specs/002-envio-e-painel/
├── spec.md
├── plan.md               # este arquivo
├── research.md           # decisões, desvios do plano aceito, achados
├── data-model.md         # esquema do servidor e mapeamento celular -> servidor
├── quickstart.md         # rodar os testes do servidor; ligar uma nuvem de verdade
├── contracts/servidor.md # o fio: endpoints, visões do painel, respostas
└── tasks.md              # Fatias 0 a 5
```

### Source Code (repository root)

```text
servidor/                       # contrato SQL; nunca entra no app nem no painel
├── 001_schema.sql              # tabelas, append-only, resumo diário, código do projeto
├── 002_rls.sql                 # RLS, privilégios, resgate, cadastro, visões do painel
├── 003_seed.sql                # demonstração, sem pessoa real
├── 004_lgpd.sql                # porta única de apagamento, com registro
├── lgpd/apagar-apicultor.sql   # procedimento fora de banda (psql, com confirmação)
├── golden/                     # casos de referência: celular E servidor
└── teste/                      # rodar.sh, supabase-local.sql, golden.sql, rls.sql, esquema.sql

src/core/codigo-projeto.ts      # base32 de Crockford + Luhn mod 32
src/core/envio/mensagens.ts     # motivo de parada -> texto (i18n)
src/core/ports/nuvem.ts         # porta (+ motivo 'muitas-tentativas')
src/nuvem/
├── index.ts                    # registro: real se configurada, senão simulada
├── config.ts                   # EXPO_PUBLIC_*; recusa chave de serviço e http
├── mock/cliente.ts             # nuvem simulada (código de demonstração corrigido)
└── supabase/                   # cliente real: cliente.ts, http.ts, esquemas.ts, cofre.ts
src/app/vincular.tsx            # Ligar o celular ao projeto
src/app/(tabs)/enviar.tsx       # migrada para i18n; leva a /vincular

tests/  codigo-projeto, resumo-golden, nuvem-supabase, nuvem-config,
        envio-mensagens, encanamento (+ apoio/supabase-falso.ts)
```

**Structure Decision**: dois artefatos e um contrato SQL no mesmo repositório, sem
workspace. `painel/` (outra frente) tem `package.json` próprio; Metro, `tsconfig` e vitest
do app ignoram `painel/` e `servidor/` (`tests/encanamento.test.ts`).

## Análise manual (no lugar de `/speckit-analyze`)

Conferência cruzada spec ↔ plano ↔ tarefas feita à mão nesta frente:

- FR-001…FR-023, FR-036…FR-039: cada um tem tarefa e evidência em tasks.md (Fatias 0 e 1)
  ou tarefa aberta (FR-015 → T030; SC-006 → T064).
- FR-024…FR-035: Fatias 2–4, frente do painel. O contrato que elas consomem está em
  `contracts/servidor.md`.
- **Conflito encontrado**: a spec chama o código de "credencial de uso único" e, nos casos
  de borda, pede que o celular reinstalado e o segundo celular funcionem com o código.
  Adotado: um código **ativo** por apicultor, reutilizável até a pesquisadora gerar outro
  (research.md R-004). Precisa de `/speckit-clarify` (T035).
- **Conflito encontrado**: o glossário manda "sincronizar"; a tela diz "Enviar". Resolvido
  como no plano aceito: *enviar* é palavra de tela (seção nova do glossário).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| II. Orçamento sem medição nesta fatia | Não há aparelho de referência nem projeto de nuvem nesta frente; medir exige os dois | "Medir no emulador": a constituição diz que número de emulador só vale para pré-triagem. Mitigação: zero dependência nova; o cliente inteiro (`src/nuvem/supabase/`, `config.ts`, `index.ts`) tem ~680 linhas de TS (~160 de comentário), sem SDK; medição em T065 |
| VII. `/speckit-analyze` não executado | `feature.json` aponta para a 003 e é compartilhado por várias frentes; mudar aqui geraria conflito de merge garantido | "Apontar `feature.json` para a 002 neste branch": pedido explícito de não mexer. Mitigação: Análise manual acima; T069 roda o comando quando a 002 for a feature ativa |
| Cliente HTTP escrito à mão em vez de `@supabase/supabase-js` | O app usa 2 serviços e 6 endereços; o SDK traz realtime, storage e functions para dentro de um app de 2 GB que paga todo arranque a frio | "Usar o SDK": centenas de kB no bundle e um caminho de renovação de sessão que não controlamos. Contrapeso honesto: renovação e guarda de portal (~150 linhas) são nossas e estão testadas com `fetch` falso |
| V. Rótulo do botão primário a 5,93:1 (token `cores.acento`) | O token é compartilhado por todas as telas e está com a frente `fix/001-dividas-de-tela`; mudar aqui garante conflito e muda telas fora desta frente | "Escurecer `acento` nesta frente": é a correção certa, mas é decisão de paleta para o app inteiro; fica em T071, junto com a frente das telas |
| Sessão em memória (FR-015 parcialmente atendido) | Guardar o token protegido exige `expo-secure-store`, que não está instalado | "Guardar no SQLite/localStorage": cumpriria a conveniência e violaria FR-015. Em memória, o custo é pedir o código de novo; T030 instala a dependência |
