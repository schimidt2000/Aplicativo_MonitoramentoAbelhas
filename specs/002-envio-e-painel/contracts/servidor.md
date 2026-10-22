# Contrato: app de campo e painel ↔ servidor

O servidor é a interface entre as frentes: o app de campo escreve, o painel lê, e os dois
só conhecem o que está aqui e em `servidor/*.sql`. Se este arquivo divergir do SQL, vale o
SQL — e este arquivo é corrigido no mesmo PR.

Todos os pedidos levam `apikey: <chave pública>`. Os autenticados levam também
`Authorization: Bearer <access_token>`. Nenhum dado pessoal vai no endereço (FR-033):
filtros por pessoa usam `id` (pseudônimo), nunca nome.

## App de campo

| # | Pedido | Corpo | Sucesso | O que o cliente faz com o resto |
|---|---|---|---|---|
| 1 | `GET /auth/v1/health` | — | `200` + JSON com `name`/`version` | 200 que não é esse JSON → `portal-cativo`; sem resposta → `sem-rede`; prazo → `tempo-esgotado` |
| 2 | `POST /auth/v1/signup` | `{}` | `200` + sessão | exige "Allow anonymous sign-ins" no projeto |
| 3 | `POST /auth/v1/token?grant_type=refresh_token` | `{"refresh_token": …}` | `200` + sessão | `400`/`401` → sessão morta → `sem-vinculo` (pede o código de novo) |
| 4 | `POST /rest/v1/rpc/redeem_project_code` | `{"p_code": "DEM0A1B4"}` (canônico, sem hífen) | `200` + `{"status": …}` | ver abaixo |
| 5 | `POST /rest/v1/rpc/upsert_registry` | `{"p_apiaries": […], "p_hives": […], "p_nodes": […]}` | `200` + `{"apiaries","hives","nodes"}` | nó de outro apicultor → `403` → `recusado` |
| 6 | `POST /rest/v1/reading?on_conflict=device_id,seq` com `Prefer: resolution=ignore-duplicates,return=minimal` | `[leitura, …]` | **exatamente `201`** | qualquer outra coisa NÃO confirma; HTML → `portal-cativo`; 5xx/429 → `servidor`; 4xx → `recusado`; `401` → renova uma vez e repete |

Ordem obrigatória por envio: 1 → (2 ou 3, se preciso) → 5 → 6. O 6 antes do 5 é recusado
pela RLS (o nó precisa existir e ser do mesmo apicultor).

### Resgate do código (`redeem_project_code`)

| Resposta | Significa | Motivo no app |
|---|---|---|
| `{"status":"ok","beekeeper_name":…,"project_name":…}` | celular ligado | — |
| `{"status":"invalid"}` | código inexistente ou revogado | `codigo-invalido` |
| `{"status":"throttled"}` | 5 erros na hora (deste celular) ou teto global | `muitas-tentativas` |
| `{"status":"locked"}` | 10 erros em 24 h (deste celular) | `codigo-travado` |

### Uma leitura no fio

```json
{ "device_id": "AA00…", "seq": 1234, "t_node": 1110600, "t_utc_ms": 1790000000000,
  "t_quality": 1, "temp_c100": 3460, "rh_x100": 6200, "tvoc_ppb": 900, "eco2_ppm": 700,
  "aqi_uba": 2, "gas_status": 0, "batt_mv": 4000, "flags": 0, "boot_id": "b1",
  "sensor_epoch": 1, "calib_version": 1, "proto_ver": 1, "src": "mock" }
```

Nunca `node_id`, nunca `beekeeper_id`. Valores brutos; ausente é `null`.

### Cadastro no fio

```json
{ "p_apiaries": [{ "id": "ap-1", "name": "…", "municipality": "…", "state": "RN",
                   "updated_ms": 1, "deleted_ms": null }],
  "p_hives":    [{ "id": "h-1", "apiary_id": "ap-1", "name": "…", "species": null,
                   "installed_at_ms": null, "updated_ms": 1, "deleted_ms": null }],
  "p_nodes":    [{ "device_id": "AA00…", "hive_id": "h-1", "placement": null,
                   "period_s": 900, "sensor_epoch": 1, "calib_version": 1,
                   "temp_offset_c100": 0, "updated_ms": 1 }] }
```

## Painel (só leitura, sessão de pesquisadora)

`GET /rest/v1/<visão>?select=…` — a RLS entrega só os apicultores dos projetos dela.

### `hive_overview` — uma linha por colmeia (FR-025)

`beekeeper_id uuid`, `hive_id text`, `hive_name text`, `species text|null`,
`apiary_id text`, `apiary_name text`, `beekeeper_name text`, `municipality text|null`,
`state text|null`, `last_reading_ms bigint|null`, `reading_count bigint`,
`excluded_count bigint`, `unknown_time_count bigint`.

Sem coluna de voláteis, de propósito (FR-031). Uma colmeia é identificada por
`(beekeeper_id, hive_id)`: `hive_id` sozinho repete entre apicultores.

### `hive_daily` — resumos para o gráfico (FR-026 a FR-029)

`beekeeper_id`, `hive_id`, `device_id`, `day int` (dias UTC desde 1970-01-01),
`sensor_epoch int`, `temp_p5`, `temp_med`, `temp_p95` (°C × 100; hoje p5/p95 = mín/máx,
achado A-2), `rh_med` (%UR × 100), `tvoc_med`, `tvoc_amp` (ppb), `batt_med` (mV),
`sample_count`, `excluded_count`, `temp_offset_c100` (correção, aplicar só na exibição).

**Só os dias que têm linha.** Dia ausente chega como elemento ausente, não como `null`:
quem desenha percorre o calendário e quebra a linha na troca de `sensor_epoch`.

### `hive_reading` — leituras para a planilha (FR-034, FR-035)

`beekeeper_id`, `hive_id`, `device_id`, `seq`, `t_node`, `t_utc_ms` (pode ser `null`),
`t_quality`, `sensor_epoch`, `calib_version`, `proto_ver`, `temp_c100`, `rh_x100`,
`tvoc_ppb`, `eco2_ppm` (**derivado, não é CO₂**), `aqi_uba`, `gas_status`, `batt_mv`,
`flags`, `excluded bool`.

### Tabela `node` — também lida pelo painel

Além das três visões, o painel lê a **tabela** `node` (só `select`), para achar os nós de
cada colmeia e a correção de temperatura a aplicar na exibição:
`GET /rest/v1/node?select=device_id,beekeeper_id,hive_id,temp_offset_c100&beekeeper_id=eq.<uuid>&hive_id=in.(…)`
(`painel/src/dados/contrato.ts`, `COLUNAS_NO`). O acesso vem da política
`researcher_reads_node` (`servidor/002_rls.sql`): `select` para `authenticated`, restrito
aos apicultores dos projetos da pesquisadora. Mudar ou remover essa política quebra a tela
da colmeia no painel.

### Gerar código para um apicultor

`POST /rest/v1/rpc/issue_project_code` `{"p_beekeeper_id": "<uuid>"}` → `"ABCD-EF12"`
(texto). Mostrado uma vez; o banco guarda só o hash. Revoga o código anterior; celulares
já ligados continuam ligados. Apicultor de outro projeto → `403`.
