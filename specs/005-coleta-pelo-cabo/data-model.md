# Fase 1 — Modelo de dados

**Feature**: `specs/005-coleta-pelo-cabo` · **Data**: 2026-10-21

Complementa `specs/001-coleta-offline/data-model.md` e `specs/003-hora-das-leituras/data-model.md`.
Esquema versionado por `PRAGMA user_version`: **1** = DDL da 001; **2** = 003; **3** = esta
feature. A migração 3 só **acrescenta** colunas e recria a VIEW: nenhuma tabela é
reconstruída, nenhuma linha é copiada, nenhuma leitura muda.

---

## `reading` (versão 3)

Mesma chave `(node_id, seq)`, `WITHOUT ROWID`, append-only (só `synced_at` muda depois).

| Coluna | Mudança | Para leituras do cabo (`proto_ver = 100`) |
|---|---|---|
| `seq` | igual | `início do arquivo (s) × 1.000.000 + número da medição` (D-501) |
| `t_node` | igual | número da medição (`Measurement.id`), bruto |
| `t_utc_ms`, `t_quality`, `t_motivo` | igual | `NULL`, `3`, `em-avaliacao` na gravação; a hora que vale é a da VIEW |
| `clock_mode` | igual (valor novo) | `contagem` |
| `temp_c100`, `rh_x100` | igual | `Math.round(bruto × 100)`, ou NULL se o bruto não é número |
| `temp_bruto` | **nova**, REAL? | o `float32` da temperatura como veio (°C). NULL nas leituras de antes |
| `rh_bruto` | **nova**, REAL? | o `float32` da umidade como veio (%UR) |
| `tvoc_ppb`, `eco2_ppm` | igual | `uint16` como veio. eCO₂ é derivado, nunca CO₂ |
| `aqi_uba`, `gas_status`, `batt_mv` | igual | NULL: o arquivo não traz (D-517) |
| `flags` | igual | bit 0: temperatura não é número; bit 1: umidade não é número |
| `boot_id`, `boot_no` | igual | NULL |
| `proto_ver` | igual | `100` = `arquivo-0` (D-516) |
| `src` | igual | `cable` (placa real) ou `mock` (placa simulada) |

## `node` (versão 3)

| Coluna | Mudança | Notas |
|---|---|---|
| `intervalo_medicao_s` | **nova**, INTEGER? | intervalo entre medições da placa, editável na tela da colmeia. NULL = padrão 7200 s. Não é o `period_s` da 001 (período informado pelo nó simulado) |
| `mac` | **nova**, TEXT? | MAC informado no `READY`, `AA:BB:CC:DD:EE:FF`. Índice único parcial (`WHERE mac IS NOT NULL`). Nunca enviado à nuvem |

Um nó criado pela coleta pelo cabo sem nó prévio na colmeia: `device_id = placa-<16 hex>`.

## `pull_session` (versão 3)

A sessão do cabo é gravada **na mesma transação** das leituras, antes de `RECEIVED`, com
`outcome = 'gravado'`; no fim, a linha recebe o desfecho. `pull_session` é escrituração, não
leitura: a regra de append-only da constituição é sobre `reading`.

| Coluna | Mudança | Notas |
|---|---|---|
| `raw` | igual (passa a ser usada) | o arquivo inteiro como chegou (ou o que chegou, se caiu) |
| `proto_ver` | igual | `100` quando o arquivo foi lido; NULL se o formato não foi reconhecido |
| `formato` | **nova**, TEXT? | `arquivo-0` |
| `crc32` | **nova**, TEXT? | o CRC anunciado em `FILE_INFO`, 8 dígitos hexadecimais |
| `fim_da_placa` | **nova**, TEXT? | `apagou` · `nao-apagou` · `sem-arquivo` · `nao-se-sabe` (D-514) |
| `erro_da_placa` | **nova**, TEXT? | o `ERROR:*` que a placa mandou, sem o prefixo |
| `hora_enviada_s` | **nova**, INTEGER? | os segundos Unix enviados depois de `REQUEST_TIMESTAMP` |
| `registro` | **nova**, TEXT? | as linhas de texto trocadas (sem o binário), até 16 KB, para diagnóstico com o grupo do firmware |

`outcome` ganha os valores: `gravado` (provisório, antes do fim), `ok`, `placa_nao_apagou`,
`placa_sem_arquivo`, `placa_nao_se_sabe`, e os da 001 para os fins sem gravação.

## `clock_anchor` — referências de hora (sem mudança de esquema)

A coleta pelo cabo grava uma referência por coleta, na transação da gravação:

| Campo | Valor |
|---|---|
| `origem` | `coleta` |
| `t_node` | `N − 1` (número da última medição), ou 0 sem medições |
| `t_utc_ms` | hora do celular quando o arquivo terminou de chegar (`Tc`) |
| `trusted` | 1 se a hora do celular é plausível (`avaliarRelogioDoCelular`) |
| `seq_ref` | `seq` da última medição; NULL sem medições |
| `clock_mode` | `contagem` |
| `periodo_s` | o intervalo do `FILE_INFO`, se veio |

E, quando a placa confirma que recomeçou (`SESSION_COMPLETE` ou `BACKUP_CLEANUP_FAILED`),
uma referência `acerto` com `t_utc_ms = hora enviada`, `t_node = 0`, `seq_ref = NULL`, do
mesmo `grupo`: é o início do próximo arquivo, guardado como proveniência.

## `hora_correcao` (versão 3)

| Coluna | Mudança | Notas |
|---|---|---|
| `ms_por_unidade` | **nova**, INTEGER? | quanto vale uma unidade de `t_node`, em ms. NULL = 1000 (segundos, a 003). Contagem: `intervalo × 1000` |

Uma faixa de contagem: `seq_ini..seq_fim` de um trecho do arquivo, `ligada` = `seq` da
primeira medição do arquivo, `ref_id` = a coleta que conferiu, `ref_t_node = 0`,
`ref_t_utc_ms = início × 1000` (NULL se sem hora), `t_quality` 2 ou 3, `motivo`.

## VIEW `leitura_hora` (versão 3)

Igual à da 003, com duas diferenças:

```sql
ELSE c.ref_t_utc_ms - (c.ref_t_node - r.t_node) * COALESCE(c.ms_por_unidade, 1000) END AS t_utc_ms
… , r.temp_bruto, r.rh_bruto
```

Para as leituras de antes, `ms_por_unidade` é NULL e a conta é exatamente a da 003.

## Motivos de hora novos (`t_motivo`)

| Motivo | Qualidade | Quando |
|---|---|---|
| `contagem-conferida` | 2 estimada | a conta fechou (FR-017) |
| `contagem-sem-conferencia` | 3 sem hora | nenhuma coleta com hora plausível viu estas medições |
| `contagem-a-mais` | 3 sem hora | mais medições do que o tempo permite |
| `contagem-a-menos` | 3 sem hora | menos medições do que o tempo permite |
| `inicio-implausivel` | 3 sem hora | início antes de 01/09/2026 ou depois da coleta |

## Invariantes (cada uma com teste)

- **INV-501** reimportar o mesmo arquivo: contagem e conteúdo de `reading` idênticos.
- **INV-502** arquivo maior que contém o anterior: as linhas antigas idênticas, campo a campo;
  só as novas entram.
- **INV-503** `RECEIVED` nunca sai antes de `gravou`; `gravou` só depois do commit e do
  `persist()`.
- **INV-504** a placa só pode ter apagado (`fim_da_placa ∈ {apagou, sem-arquivo,
  nao-se-sabe}`) se a sessão gravou.
- **INV-505** nenhuma leitura de contagem tem qualidade 0 ou 1; qualidade 2 só com
  `contagem-conferida`.
- **INV-506** mudar o intervalo do cadastro grava uma versão nova de horas e não muda nenhuma
  leitura.
- **INV-507** migração 2 → 3 com banco populado: leituras e horas de antes idênticas.
- **INV-508** mesma chave com conteúdo diferente nunca muda a leitura gravada e nunca some
  calada: é contada no resultado, avisada, e o arquivo inteiro fica no bruto da sessão (D-519).
