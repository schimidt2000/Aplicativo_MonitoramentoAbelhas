# Data Model: servidor da feature 002

Fonte de verdade: `servidor/001_schema.sql` e `servidor/002_rls.sql`. Este arquivo explica;
se divergir do SQL, vale o SQL.

**Regra de ouro**: nenhuma tabela tem coluna de latitude ou longitude (FR-022). A ausência
da coluna é a garantia; `check:fronteira` e `servidor/teste/esquema.sql` conferem.

## Pessoas e acesso

| Tabela | Chave | Colunas | Quem lê | Quem escreve |
|---|---|---|---|---|
| `project` | `id` | `name` | pesquisadora do projeto | dono do banco |
| `beekeeper` | `id` | `project_id`, `name`, `municipality`, `state`, `consent_at` | pesquisadora do projeto; o próprio celular (só a si) | dono do banco |
| `project_code` | `code_hash` | `beekeeper_id`, `created_at`, `revoked_at` | ninguém (RLS sem política) | `issue_project_code`, `register_project_code` |
| `phone_link` | `user_id` | `beekeeper_id`, `linked_at` | ninguém | `redeem_project_code` |
| `researcher_project` | `(user_id, project_id)` | — | a própria pesquisadora | `private.add_researcher` |
| `private.code_attempt` | `id` | `user_id`, `ok`, `attempted_at` | ninguém | `redeem_project_code` |
| `private.secret` | `name` | `value` (pepper) | ninguém | gerado na criação |
| `private.erasure_log` | `id` | pedido, id do apicultor, contagens, quem, quando — **sem nome** | dono do banco | `erase_beekeeper` |

Apicultor tem **nome e município**, nada mais: sem CPF, RG, endereço ou coordenada
(FR-037). `consent_at` é obrigatório: não há apicultor sem consentimento registrado.

## Cadastro espelhado (Trilha B)

| Celular (`src/data/ddl.ts`) | Servidor | Observação |
|---|---|---|
| `apiary(id, nome, municipio, uf, updated_ms, deleted_ms)` | `apiary(beekeeper_id, id, name, municipality, state, updated_ms, deleted_ms)` | chave `(beekeeper_id, id)`: `ap-1` não é único entre celulares |
| `hive(id, apiary_id, nome, especie, instalada_em, notas, …)` | `hive(beekeeper_id, id, apiary_id, name, species, installed_at_ms, …)` | `notas` **não sobe** (texto livre pode ter dado pessoal) |
| `node(node_id, device_id, hive_id, placement, period_s, sensor_epoch, calib_version, temp_offset_c100, last_seen_ms, …)` | `node(device_id, beekeeper_id, hive_id, placement, period_s, sensor_epoch, calib_version, temp_offset_c100, updated_ms)` | `node_id` **nunca sobe** (surrogate local). `device_id` é a identidade global. `updated_ms` ← `last_seen_ms` |

Remoção é lógica (`deleted_ms`). Última escrita vence por `updated_ms`.

## A série

| Celular `reading` | Servidor `reading` |
|---|---|
| chave `(node_id, seq)` | chave **`(device_id, seq)`** |
| `t_node, t_utc_ms, t_quality` | iguais; `t_utc_ms` aceita nulo (feature 003) |
| `temp_c100, rh_x100, tvoc_ppb, eco2_ppm, aqi_uba, gas_status, batt_mv, flags` | iguais, valores brutos, nulo = ausente |
| `boot_id, sensor_epoch, calib_version, proto_ver, src` | iguais; `boot_id` nunca em chave |
| `ing_ms`, `synced_at` | não sobem (escrituração local) |
| — | `beekeeper_id` (preenchido pelo servidor a partir da sessão), `received_at` |

Sem UPDATE e sem DELETE, por política **e** por gatilho (vale até para o dono do banco).
A única porta é `private.erase_beekeeper` (LGPD).

## Derivados (escritos só por gatilho)

`reading_daily(device_id, day, sensor_epoch, temp_p5, temp_med, temp_p95, rh_med,
tvoc_med, tvoc_amp, batt_med, sample_count, excluded_count, beekeeper_id)` — chave
`(device_id, day, sensor_epoch)`. Mesma regra de `recalcularResumos` do celular:

- gás só entra com `gas_status = 0`; temperatura, umidade e bateria entram de toda leitura;
- `sample_count` = leituras com gás válido ou sem gás; `excluded_count` = gás inválido;
- dia sem nenhuma amostra válida **não gera linha** (é a lacuna do gráfico);
- leitura sem hora (`t_utc_ms` nulo) fica fora;
- `day` = dia UTC (`public.utc_day`), divisão inteira como no SQLite;
- médias truncadas em direção a zero.

`node_stats(device_id, beekeeper_id, reading_count, excluded_count, unknown_time_count,
last_reading_ms)` — contagens de TODA leitura do nó, para a visão do conjunto.

## Visões do painel (`security_invoker`: a RLS de baixo vale)

- `hive_overview` — uma linha por colmeia: apicultor, local, município, última leitura,
  leituras, excluídas, sem hora. **Sem coluna de voláteis** (FR-031).
- `hive_daily` — `reading_daily` com `hive_id` e a correção de temperatura do nó.
- `hive_reading` — leituras com `hive_id` e `excluded`, para a planilha.

Colunas exatas em [contracts/servidor.md](./contracts/servidor.md).
