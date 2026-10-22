# Fase 1 — Modelo de dados

**Feature**: `specs/003-hora-das-leituras` · **Data**: 2026-10-21

Complementa `specs/001-coleta-offline/data-model.md`. Esquema versionado por
`PRAGMA user_version` (D-309): **1** = DDL da 001; **2** = esta feature.

---

## `reading` (versão 2)

Mesma chave `(node_id, seq)`, `WITHOUT ROWID`. Continua append-only: a única escrita
posterior é `synced_at` (exceção da constituição 1.1.0).

| Coluna | Mudança | Notas |
|---|---|---|
| `t_utc_ms` | **passa a aceitar NULL** | hora calculada **na gravação**. Leitura nova: `NULL` |
| `t_quality` | igual | na gravação: `3` para leitura nova |
| `t_motivo` | **nova**, TEXT? | por que a hora é estimada ou desconhecida. Leitura nova: `em-avaliacao` |
| `boot_no` | **nova**, INTEGER? | número da ligada informado pelo nó, se vier (FR-001). Bruto |
| `clock_mode` | **nova**, TEXT? | `uptime` \| `rtc` \| `none`, como o nó informou na coleta. Bruto |
| `boot_id` | igual | leitura nova grava `NULL`: o nó não manda isso por leitura, e copiar o da sessão era a atribuição errada do achado relogio:1 |

Os valores da linha **nunca** mudam. A hora que vale é a da VIEW `leitura_hora`.

---

## `clock_anchor` — as referências de hora (versão 2)

Reconstruída para ganhar `id`. Antes a chave era `(node_id, boot_id, t_node)`, que colide
entre ligadas diferentes com o mesmo contador e não dá para referenciar de outra tabela.

| Coluna | Notas |
|---|---|
| `id` | INTEGER PK AUTOINCREMENT |
| `node_id`, `boot_id`, `t_node`, `t_utc_ms`, `mono_ms`, `rtt_ms`, `src`, `trusted` | como na 001 |
| `origem` | `coleta` \| `acerto` \| `semente` \| `legado` |
| `grupo` | id da referência de coleta da mesma visita. Acerto e coleta da mesma visita não se conferem entre si |
| `boot_no` | número da ligada informado pelo nó, se vier |
| `seq_ref` | `NodeInfo.newestSeq` no momento: liga a referência à ligada (D-305) |
| `clock_mode` | modo de tempo informado pelo nó |
| `periodo_s` | período de medição informado pelo nó na sessão (`NodeInfo.samplePeriodS`); dá a margem da D-305. NULL nas referências antigas: vale o do cadastro (`node.period_s`) |
| `criado_ms` | hora do celular ao gravar |

`trusted = 0` quando a hora do celular é implausível (antes do início do projeto) ou o nó não
tem noção de tempo: a referência fica guardada, **rejeitada**, nunca usada.

O **estado** (não conferida, conferida, em conflito, revogada, rejeitada, sem ligada) **não é
coluna**: é calculado a cada avaliação a partir das referências, das revogações e das
decisões. Assim não existe estado que fique velho.

---

## `referencia_revogada` — append-only

| Coluna | Notas |
|---|---|
| `ref_id` | PK. Revogar de novo não faz nada |
| `revogada_ms` | quando |
| `motivo` | `apicultor-confirmou-a-data` |
| `decisao_id` | a decisão que causou, se houver |

FR-013: a referência continua em `clock_anchor`; esta tabela só diz que ela deixou de valer.

---

## `hora_decisao` — append-only

| Coluna | Notas |
|---|---|
| `id` | PK |
| `node_id`, `ref_id` | a referência da coleta em conflito |
| `resposta` | `sim` \| `nao` |
| `hora_celular_ms` | a hora que o celular mostrava ao apicultor |
| `decidido_ms` | quando |

FR-011: a decisão fica registrada com data e hora. Uma decisão `sim` faz o grupo daquela
referência contar como **conferido**.

---

## `hora_versao` e `hora_correcao` — append-only

Uma **versão** é uma avaliação completa das horas de um nó (D-303).

`hora_versao`: `id` PK, `node_id`, `criado_ms`, `causa` (`coleta`, `confirmacao`,
`instalacao-003`, `semente`).

`hora_correcao` (chave `(versao_id, seq_ini)`):

| Coluna | Notas |
|---|---|
| `versao_id`, `node_id` | |
| `seq_ini`, `seq_fim` | faixa contígua de leituras do nó |
| `ligada` | id da ligada (`seq` da primeira leitura), ou NULL |
| `ref_id` | referência usada, ou NULL |
| `ref_t_node`, `ref_t_utc_ms` | parâmetros da conta. `ref_t_utc_ms` NULL = hora desconhecida |
| `t_quality` | 0 rtc · 1 ancorada · 2 estimada · 3 desconhecida |
| `motivo` | `referencia-nao-conferida`, `conflito-de-hora`, `ligada-sem-referencia`, `sem-nocao-de-tempo`, `hora-do-no-sem-acerto`, `acerto-revogado`; NULL se ancorada |

---

## VIEW `leitura_hora`

Todas as colunas de `reading`, com `t_utc_ms`, `t_quality` e `t_motivo` **efetivos**, mais
`ligada`, `ref_id` e `versao_id`:

```
faixa  = a faixa da última versão do nó com seq_ini ≤ seq ≤ seq_fim
t_utc  = sem faixa      → reading.t_utc_ms
         faixa sem ref  → NULL
         com ref        → ref_t_utc_ms − (ref_t_node − t_node) × 1000
```

Toda consulta de série lê daqui: resumos diários, última leitura, mais antiga pendente,
lote de envio e exportação.

---

## Resumos (`reading_daily`)

Mesmas colunas. A agregação lê `leitura_hora` e **exclui** `t_utc_ms IS NULL` (FR-017). A
contagem das que ficaram de fora sai de `contarSemHora(db, nodeId)`, mostrada ao lado do
gráfico. Resumos são refeitos toda vez que uma versão nova é gravada.

---

## Invariantes novas

| # | Invariante | Teste |
|---|---|---|
| INV-10 | Migrar um banco populado não perde nem altera leitura | `tests/migracao.test.ts` |
| INV-11 | Migração que falha deixa o banco na versão anterior | `tests/migracao.test.ts` |
| INV-12 | Migrar duas vezes é sem efeito | `tests/migracao.test.ts` |
| INV-13 | Leitura de ligada sem referência nunca sai ancorada (SC-001) | `tests/hora.test.ts` |
| INV-14 | Revogar e recalcular não muda nenhum campo de `reading` (SC-005) | `tests/hora-coleta.test.ts` |
| INV-15 | Resumo e gráfico não incluem hora desconhecida (SC-004) | `tests/hora-coleta.test.ts` |
