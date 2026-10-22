# Implementation Plan: Hora confiável das leituras

**Branch**: `feat/003-hora-das-leituras-codigo` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-hora-das-leituras/spec.md` (com as
Clarifications de 2026-10-21)

## Summary

O nó sensor não tem relógio: só conta o tempo desde que ligou, e a conta zera quando a energia
acaba. Hoje toda leitura de uma coleta recebe a hora calculada pela referência da coleta, com
selo de "ancorada", mesmo as medidas antes de a bateria acabar; a primeira data do celular
vira verdade sem conferência; e o nó sem noção de tempo ganha "estimada" sem estimativa.

A abordagem:

1. **Banco versionado** por `PRAGMA user_version`, com a primeira migração de verdade do
   projeto: `reading` passa a aceitar hora em branco, as referências ganham identidade, e
   correções vivem em tabelas à parte (D-309).
2. **A hora é avaliada no fim da coleta**, não na gravação do lote: ligadas por número do nó
   ou regressão do contador, cada referência ligada à sua ligada, conferência entre coletas,
   e a hora de cada leitura pela referência mais próxima da mesma ligada (D-302 a D-306).
3. **Correção sem reescrever**: cada avaliação grava uma versão de horas (faixas), aplicada
   por uma VIEW. A leitura original nunca muda (D-303).
4. **Conflito de data resolvido pelo apicultor** na tela de resultado: data e hora do celular
   em destaque, "Sim, está certa" / "Não" (D-307, D-308).

A lógica de hora é **domínio puro** (`src/core/hora/`), testada sem banco; o banco só carrega
os dados e grava o resultado.

## Technical Context

**Language/Version**: TypeScript ~6.0.3

**Primary Dependencies**: as da 001/002. **Nenhuma dependência nova.**

**Storage**: SQLite nos três drivers (expo-sqlite, sql.js 1.14.2 com SQLite 3.49.1,
better-sqlite3 13.0.3 com SQLite 3.53.4). Esquema passa a ser versionado por
`PRAGMA user_version`. Recursos de SQL usados: VIEW, subconsulta correlacionada, `EXCEPT`,
`ALTER TABLE … RENAME TO` — todos presentes nas três versões.

**Testing**: vitest 4.1.11. A migração roda também contra **sql.js em Node**
(`tests/apoio/bancoSqlJs.ts`), para o SQL do navegador ser exercitado de verdade.
expo-sqlite **não** roda no CI (é nativo): a cobertura dele é o mesmo SQL.

**Target Platform**: Android 8.0+ e app de campo no navegador.

**Project Type**: aplicativo móvel universal, artefato único.

**Performance Goals**: a avaliação das horas roda uma vez por colmeia no fim da coleta e lê
quatro colunas inteiras por leitura do nó. Orçamento: dentro dos 100 ms de bloqueio de UI
para 10.000 leituras. **Estimado em Node, não medido no aparelho de referência** — números
na seção Desempenho.

**Constraints**: offline sempre; nenhuma escrita em `reading` além do `INSERT OR IGNORE` e do
`synced_at`; migração não pode perder leitura.

**Scale/Scope**: 10.000 leituras por colmeia; dezenas de ligadas e de referências por nó.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Veredito | Evidência |
|---|---|---|
| I. Offline por Padrão | PASS | Tabela Comportamento Offline abaixo. Nada desta feature chama rede; o acerto do relógio pelo "Sim" fala com o nó pelo transporte, não com a internet. |
| II. Orçamento de Desempenho | VIOLAÇÃO (não medido) | **Revisto em 2026-10-22, com o mesmo critério da 002** (`specs/002-envio-e-painel/plan.md`): sem medição no aparelho de referência não há PASS. Nenhuma dependência nova. Custo medido em Node (better-sqlite3 e sql.js), seção Desempenho e `tests/hora-desempenho.test.ts`: 15 ms / 45 ms por colmeia no fim da coleta, para 10.000 leituras. **Ressalva:** estimativa, não medição no aparelho de referência (T041, pendente), com risco registrado de passar dos 100 ms no navegador de um aparelho fraco. |
| III. Leituras Imutáveis e Idempotentes | PASS | Chave `(node_id, seq)` intacta, `boot_id` e `boot_no` fora dela. Nenhum `UPDATE`/`DELETE` em `reading` (`npm run check:fronteira`). Correções em `hora_versao`/`hora_correcao`, revogações em `referencia_revogada`. Reimportação: `tests/ingestao.test.ts`. Migração com banco populado: `tests/migracao.test.ts`. SC-005: `tests/hora-coleta.test.ts`. A reconstrução da tabela está justificada em Complexity Tracking. |
| IV. O Payload é Externo | PASS | Campo novo **opcional** `ligada` em `Reading` e `NodeInfo`, sem mudar o formato v1 (o mock não manda). Suposições na tabela de `docs/integracao-firmware.md`. Mock ganha "a placa perdeu energia" e o modo sem noção de tempo coerente. Matriz de Capacidades abaixo, inalterada. Nenhum import de SDK fora de `transports/` (`check:fronteira`). |
| V. Ergonomia de Campo em pt-BR | VIOLAÇÃO (herdada) | **Revisto em 2026-10-22.** Contraste abaixo de 7:1 em texto primário: texto branco sobre `cores.acento` a 5,9:1 no botão "Sim" (`src/ui/PerguntaHora.tsx:122`) e rótulo em `cores.atencao` a 4,6:1 (`src/ui/PerguntaHora.tsx:76`). Herdada dos tokens da 001; ver Complexity Tracking. Textos novos num bloco próprio de `src/core/i18n/pt-BR.ts`, testados contra jargão (`tests/hora-mensagens.test.ts`). Botões da pergunta com `alvo.minimo` (56 dp) e 12 dp entre eles; data em `tipo.leitura` (34 sp), texto em `tipo.corpo`; cor + ícone + palavra; texto e vibração depois da resposta. Vocabulário do glossário ("relógio da colmeia", "data e hora do celular", "sem hora conhecida"). **Não verificado em tela** neste trabalho (sem servidor de desenvolvimento): T040. |
| VI. Honestidade do Dado | PASS | Hora em branco com motivo, nunca inventada (FR-016). Hora desconhecida fora dos resumos, com contagem ao lado do gráfico (FR-017). "Ancorada" só com referência conferida (D-301). Lacuna continua lacuna. **Ressalva:** FR-018 (palavra e contagem na planilha) e FR-019 (trecho estimado diferente no gráfico) ficam para a 002/T043–T044; a camada de dados já entrega qualidade e motivo. |
| VII. Especificação Antes do Código | PASS | `spec.md` com Clarifications de 2026-10-21, este plano, [research.md](./research.md), [data-model.md](./data-model.md), [tasks.md](./tasks.md). Suposições novas registradas em `docs/integracao-firmware.md` como não confirmadas. `/speckit-analyze` feito à mão (seção abaixo). |

### Tabela Comportamento Offline

| Tela / Ação | Sem rede | Rede intermitente | Fonte do dado |
|---|---|---|---|
| Abrir o app (migração e reavaliação das horas, uma vez) | Funciona integralmente | Idêntico | SQLite local |
| Coletar (avaliação das horas no fim) | Funciona integralmente | Idêntico | Transporte + SQLite local |
| Pergunta "a data do celular está certa?" | Funciona integralmente | Idêntico | SQLite local + transporte para o acerto |
| Colmeia (detalhe, gráfico, contagem sem hora) | Funciona integralmente | Idêntico | VIEW `leitura_hora`, `reading_daily` |
| Ajustes: simular "sem energia", "sem noção de tempo", "celular adiantado" | Funciona integralmente | Idêntico | SQLite local (`config`) |

### Matriz de Capacidades

Inalterada em relação à 001 (`contracts/transport.md`). Esta feature não acrescenta
transporte; ela muda o que se faz com a hora depois que a sessão abre.

| Transporte | Android | Web (desktop) | iOS |
|---|---|---|---|
| `mock` | ✅ | ✅ | ✅ |
| `ble` | futura | ❌ sem Web Bluetooth no Safari | descopado |
| `cable` | futura (004) | futura (004, Web Serial) | ❌ |

## Project Structure

### Documentation (this feature)

```text
specs/003-hora-das-leituras/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # D-301 a D-313
├── data-model.md        # esquema versão 2, VIEW, invariantes
├── quickstart.md        # como ver cada história no app de campo no navegador
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
src/core/hora/            # NOVO — domínio puro, zero import de plataforma
├── tipos.ts              # leitura de tempo, referência, faixa, estados, qualidades
├── avaliar.ts            # ligadas, atribuição, conferência, faixas (FR-001..FR-016)
└── index.ts
src/core/relogio.ts       # + tolerância da conferência
src/core/ports/transport.ts   # + `ligada?` em Reading e NodeInfo
src/core/ports/nuvem.ts       # tUtcMs: number | null
src/core/coleta/resultado.ts  # + estados 'conflito' e 'adiado', + conflito no ResultadoNo
src/core/coleta/mensagens.ts  # + pergunta de hora
src/core/preferencias.ts      # + 3 falhas de demonstração
src/core/i18n/pt-BR.ts        # + bloco "Frente 003"
src/data/migracoes.ts     # NOVO — PRAGMA user_version, prepararBanco
src/data/hora.ts          # NOVO — carrega, avalia, grava versão, revoga, decide, confirma
src/data/ingest.ts        # grava hora "em avaliação"; resumos pela VIEW
src/data/coleta.ts        # decisão de envio, referência, avaliação no fim
src/data/repo.ts          # consultas de série pela VIEW; contarSemHora
src/data/semente.ts       # semente coerente com a linha do tempo do mock
src/data/db.native.ts, db.web.ts  # prepararBanco no lugar de exec(DDL)
src/transports/mock/      # linha do tempo fixa; perdeu energia; sem noção de tempo
src/transports/index.ts   # demonstrações novas; relógio do celular na demonstração
src/app/(tabs)/coletar.tsx    # monta a pergunta (componente separado)
src/app/(tabs)/ajustes.tsx    # 3 rótulos novos
src/app/colmeia/[id].tsx      # contagem de leituras sem hora
src/ui/PerguntaHora.tsx   # NOVO — o cartão da pergunta
tests/                    # hora, hora-coleta, migracao, hora-desempenho, apoio/bancoSqlJs
```

**Structure Decision**: a regra de hora é domínio puro em `src/core/hora/`, como o
decodificador: entra `{seq, tNode, ligada, modo}` e referências, sai faixas. Isso a deixa
testável sem banco e reaproveitável pelo painel no futuro. O banco (`src/data/hora.ts`) só
carrega, chama e grava. A pergunta de hora é componente próprio (`src/ui/PerguntaHora.tsx`)
para que `coletar.tsx`, que outra frente está reescrevendo, ganhe só algumas linhas.

## Desempenho

Medido por `tests/hora-desempenho.test.ts` em Node, num MacBook. **Não é o aparelho de
referência**: vale só para pré-triagem (Princípio II). 10.000 leituras, 20 coletas, um
reinício; números estáveis em três rodadas:

| Operação | better-sqlite3 | sql.js (navegador) |
|---|---|---|
| Fim da coleta: avaliar + gravar versão + refazer resumos | 15 ms | 45 ms |
| — só carregar as leituras para a avaliação | — | ~21 ms |
| — só refazer os resumos pela VIEW (antes, direto em `reading`: ~10 ms) | — | ~19 ms |
| Lista de colmeias (última leitura pela VIEW) | 15 ms | 29 ms |
| Lote de envio de 500 pela VIEW | 1 ms | 4 ms |

**Risco registrado.** O fim da coleta ficou ~35 ms mais caro em sql.js. Extrapolando um fator
de 5 a 8 para um Snapdragon 425, pode passar dos 100 ms por colmeia no app de campo no
navegador. Não medido (T041). Se confirmar: avaliar só a partir da ligada mais antiga que a
coleta tocou, e refazer só os dias afetados.

## Complexity Tracking

| Ponto | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| II. Orçamento sem medição no aparelho de referência (revisto em 2026-10-22) | Não há aparelho de referência nesta frente; o custo foi medido só em Node (15 ms / 45 ms por colmeia, 10.000 leituras) | "Declarar PASS pela estimativa": a 002 marcou VIOLAÇÃO pela mesma falta, e o critério precisa ser o mesmo. Mitigação: nenhuma dependência nova, `tests/hora-desempenho.test.ts`; medição em T041 |
| V. Contraste herdado abaixo de 7:1 na pergunta da hora (revisto em 2026-10-22): branco sobre `acento` 5,9:1 (`PerguntaHora.tsx:122`), texto em `atencao` 4,6:1 (`PerguntaHora.tsx:76`) | Os tokens `acento` e `atencao` são do app inteiro (001) e a correção de paleta está com a 002/T071 | "Escurecer os tokens nesta frente": muda todas as telas fora da 003. "Trocar a cor só aqui": cria uma terceira paleta; o rótulo de atenção já vai com ícone e palavra, o que não substitui o contraste |
| A migração 2 **recria** a tabela `reading` (cria cópia, copia tudo, remove a velha, renomeia) | `t_utc_ms` era `NOT NULL`, e FR-016 exige hora em branco. SQLite não tem `ALTER COLUMN`. | (a) **Gravar uma hora inventada com `t_quality = 3`**: é exatamente o que FR-016 proíbe, e ela entraria em qualquer consulta que esquecesse o filtro. (b) **Coluna nova `t_utc_ms2` anulável**: deixa a coluna velha `NOT NULL` obrigando a gravar um valor falso em toda leitura nova. |

**Por que a cópia integral não viola o Princípio III.** O princípio protege a **série**: nenhum
valor medido pode ser alterado ou perdido, e a correção vem à parte. A reconstrução:

1. copia **todas** as colunas de **todas** as linhas, sem transformar valor nenhum;
2. antes de remover a tabela antiga, confere que a contagem é igual e que
   `SELECT <colunas> FROM reading EXCEPT SELECT <colunas> FROM reading_003` volta vazio — se
   não, lança e a transação inteira desfaz;
3. roda numa única transação com o `PRAGMA user_version`: ou o banco termina na versão 2 com
   todas as linhas, ou continua na versão 1 como estava;
4. tem teste com banco populado, comparando linha a linha e campo a campo, inclusive NULLs e
   `synced_at` (`tests/migracao.test.ts`), e o mesmo teste roda em sql.js.

Nenhum `UPDATE` nem `DELETE` é executado em `reading`. O `DROP TABLE` atinge uma tabela cujo
conteúdo já existe, idêntico e conferido, na nova. A hora antiga de cada linha também é
preservada: ela continua em `reading.t_utc_ms`; a reavaliação de FR-015 entra como correção à
parte.

## Análise cruzada (substitui `/speckit-analyze`, feito à mão)

| Achado | Gravidade | Situação |
|---|---|---|
| FR-018/SC-003 (palavra e contagem na planilha) não têm tela: o app de campo não exporta planilha hoje | MÉDIA | Camada de dados entrega qualidade e motivo (`leiturasParaExportar`); a planilha é da 002 (painel). T043 |
| FR-019 (trecho estimado diferente no gráfico) | MÉDIA | Não entra nesta entrega. T044 |
| SC-006 (três pessoas entendem o aviso) | BAIXA | Teste com pessoas, fora do código. T045 |
| SC-002 pede "no máximo uma ação": o "Sim" é a ação; a terceira coleta acerta mesmo se o "Sim" não alcançar o nó | — | coberto por teste |
| D-301 muda o comportamento da 002 (primeira coleta deixa de sair ancorada) | — | consequência exigida por FR-012/FR-016; testes antigos atualizados |
| Banco do navegador criado antes da 003 guarda âncoras do mock antigo, que reinventava a história do nó a cada conexão: a primeira coleta depois da migração pode perguntar a data | BAIXA | Só dado de demonstração; `quickstart.md` manda apagar os dados do site. Um "Sim" resolve |
| Nenhum conflito CRITICAL com a constituição | — | — |
