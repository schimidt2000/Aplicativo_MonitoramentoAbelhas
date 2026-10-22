# Phase 1 — Modelo de dados

**Feature**: `specs/001-coleta-offline` · **Data**: 2026-09-10

Um único esquema Drizzle (`src/data/schema.ts`) alimenta os três drivers: `expo-sqlite` no
Android, `sql.js` no navegador, `better-sqlite3` nos testes.

## Pragmas

```sql
PRAGMA journal_mode = WAL;      -- ignorado por sql.js; correto no nativo
PRAGMA synchronous  = NORMAL;   -- seguro a falhas e bem mais rápido em eMMC
PRAGMA foreign_keys = ON;
```

---

## `reading` — a tabela central

Append-only. É o produto científico do projeto (Princípio III).

| Coluna | Tipo | Notas |
|---|---|---|
| `node_id` | INTEGER | *surrogate* pequeno. **Não** o identificador hexadecimal |
| `seq` | INTEGER | contador do nó |
| `t_node` | INTEGER | contador bruto do nó. **Imutável** |
| `t_utc_ms` | INTEGER | **derivado** de `t_node` + âncoras. Recalculável |
| `t_quality` | INTEGER | `0` rtc · `1` ancorado · `2` estimado · `3` desconhecido |
| `temp_c100` | INTEGER? | centésimos de °C, **bruto**, sem offset aplicado |
| `rh_x100` | INTEGER? | centésimos de % |
| `tvoc_ppb` | INTEGER? | **sinal primário de gás** |
| `eco2_ppm` | INTEGER? | arquivo apenas. **Nunca exibido como CO₂** |
| `aqi_uba` | INTEGER? | arquivo apenas |
| `gas_status` | INTEGER? | validade do sensor de gás. `NULL` se a fonte não enviar |
| `batt_mv` | INTEGER? | milivolts. Conversão para estado fica no app |
| `flags` | INTEGER | bits do payload, inclusive aquecedor ativo |
| `boot_id` | TEXT? | campo de payload. **Nunca em chave** |
| `sensor_epoch` | INTEGER | fronteira de continuidade da série |
| `calib_version` | INTEGER | permite rederivar toda a série |
| `proto_ver` | INTEGER | versão do formato que originou a linha |
| `src` | TEXT | `mock` \| `ble` \| `cable` \| `file` |
| `ing_ms` | INTEGER | quando foi ingerida |
| `synced_at` | INTEGER? | `NULL` = pendente de envio |

**Chave primária: `(node_id, seq)`**, com `WITHOUT ROWID`.

Três consequências que o código precisa honrar:

- **`boot_id` fora da chave.** Se entrasse, cada reinício do nó produziria duplicatas que
  `INSERT OR IGNORE` aceitaria como linhas novas. A corrupção só apareceria meses depois.
- **`WITHOUT ROWID` com chave INTEGER**, não TEXT. A chave *é* a árvore B; uma chave textual
  faria comparação de string em toda inserção e varredura.
- **Nunca `UPDATE` nem `DELETE`.** Correção se faz por linha nova ou tabela separada.

```sql
-- A fila de envio É este índice parcial. Sem linha de fila por leitura.
CREATE INDEX ix_reading_unsynced ON reading(node_id, seq) WHERE synced_at IS NULL;
CREATE INDEX ix_reading_time     ON reading(node_id, t_utc_ms);
```

**Valores ausentes são `NULL`** (Princípio III). Nunca `0`, `-1` ou `-999`. Um `0 ppm` chega
à análise das especialistas parecendo medição real.

---

## `pull_session` — a carga bruta

Preserva cada sessão de coleta como veio, antes de qualquer decodificação (FR-010).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK | |
| `node_id` | INTEGER | |
| `started_ms` / `ended_ms` | INTEGER | |
| `proto_ver` | INTEGER? | `NULL` se a versão era desconhecida |
| `raw` | BLOB | bytes exatamente como recebidos |
| `raw_sha256` | TEXT | integridade e deduplicação |
| `record_count` | INTEGER | quantas linhas foram decodificadas |
| `outcome` | TEXT | `ok` \| `parcial` \| `versao_desconhecida` \| `erro` |
| `src` | TEXT | transporte de origem |

É barato, e é a única forma de reprocessar quando descobrirmos que um campo foi interpretado
errado. Uma carga com `outcome = 'versao_desconhecida'` é gravada **sem nenhuma linha em
`reading`** (FR-011).

---

## `clock_anchor` — a correspondência de tempo

| Coluna | Tipo | Notas |
|---|---|---|
| `node_id` | INTEGER | |
| `boot_id` | TEXT | |
| `t_node` | INTEGER | contador do nó no momento da âncora |
| `t_utc_ms` | INTEGER | relógio do celular, já corrigido pela metade do ida-e-volta |
| `mono_ms` | INTEGER | relógio monotônico, para detectar mudança manual de hora |
| `rtt_ms` | INTEGER | |
| `src` | TEXT | |
| `trusted` | INTEGER | |

Chave `(node_id, boot_id, t_node)`. **Guardadas para sempre** — são minúsculas e permitem
recalcular todos os `t_utc_ms` depois. É exatamente por isso que `t_node` é imutável.

**Mapeamento (MVP, âncora única):**

```
t_utc_ms(r) = t_utc_ancora − (t_node_ancora − r.t_node) × 1000
t_quality   = 1  (ancorado)
```

**Proteção contra relógio alterado:** se o relógio de parede se moveu sem o monotônico se
mover proporcionalmente, a âncora é marcada como não confiável. Qualquer `t_utc_ms` fora de
`[início do projeto, agora + 1 dia]` é rejeitado (edge case da spec).

---

## `reading_daily` — resumos

Computados **na ingestão**, dentro da mesma transação. A UI nunca agrega ao renderizar.

| Coluna | Tipo |
|---|---|
| `node_id`, `day` | INTEGER, chave |
| `temp_p5`, `temp_med`, `temp_p95`, `temp_sd` | INTEGER? |
| `rh_med` | INTEGER? |
| `tvoc_med`, `tvoc_amp` | INTEGER? |
| `batt_med` | INTEGER? |
| `sample_count` | INTEGER |
| `excluded_count` | INTEGER |
| `sensor_epoch` | INTEGER |

Duas regras não negociáveis (Princípio VI):

- **Só amostras válidas entram**, e `excluded_count` acompanha o resultado. Um agregado sem
  essa contagem mente por omissão (FR-020).
- **Nenhum resumo cruza fronteira de `sensor_epoch`.** O campo faz parte da linha para tornar
  isso verificável.

Um dia com `sample_count = 0` **não gera linha** — a ausência da linha é o que produz a
lacuna no gráfico (FR-019). O gráfico nunca interpola sobre dia ausente.

---

## Entidades de cadastro

**`hive`** — `id` TEXT PK, `nome`, `apiary_id`, `especie`?, `instalada_em`?, `notas`?,
`updated_ms`, `deleted_ms`? (tombstone).

**`apiary`** — `id` TEXT PK, `nome`, `lat`?, `lon`?, `municipio`?, `uf`?, `updated_ms`,
`deleted_ms`?.

**`node`** — `node_id` INTEGER PK, `device_id` TEXT UNIQUE (o identificador estável da fonte),
`hive_id`?, `placement`? (`sobre_ninho` \| `sob_tampa` \| `periferia`), `period_s`,
`sensor_installed_at`?, `temp_offset_c100` (correção, **separada do bruto**),
`calib_version`, `sensor_epoch`, `last_seen_ms`?.

`temp_offset_c100` existe por causa do aquecimento cruzado documentado em
`docs/integracao-firmware.md`: a correção é aplicada **apenas na exibição** (FR-013), nunca
gravada sobre o valor original.

---

## Invariantes verificáveis

Cada um vira teste automatizado. São o que o Princípio III exige e o que `/speckit-analyze`
vai conferir.

| # | Invariante | Como se testa |
|---|---|---|
| INV-1 | Reimportar a mesma carga não muda a contagem de linhas | importar duas vezes, comparar `COUNT(*)` |
| INV-2 | Nenhum `UPDATE`/`DELETE` em `reading` | busca estática no código-fonte |
| INV-3 | Lacuna em `seq` não gera erro nem alerta | carga com `seq` 1,2,5,6 ingere quatro linhas |
| INV-4 | Versão desconhecida não grava nada em `reading` | `COUNT(*)` inalterado, `pull_session` gravada |
| INV-5 | Amostra inválida entra em `reading` mas não no resumo | `excluded_count` > 0, médias sem ela |
| INV-6 | Resumo não cruza época | duas épocas produzem linhas separadas |
| INV-7 | Ausência é `NULL`, nunca sentinela | nenhum `0`/`-1`/`-999` em coluna de medição |
| INV-8 | Retomada não regrava | interromper em 62%, retomar, contar |
| INV-9 | `t_node` nunca muda após gravado | recalcular `t_utc_ms` não toca `t_node` |
