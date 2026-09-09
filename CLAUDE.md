# Bee-sertão

Offline-first app that pulls hive microclimate data (temperature, humidity, gas, battery)
off a sensor node at the hive, stores it in SQLite, and syncs it later for specialists to
analyse. Users are beekeepers in the Brazilian semi-arid, on low-end Android phones.

**Scope boundary:** this team owns everything from the moment the phone reaches the hive —
transport, decoding, local DB, sync, UI, export, web dashboard. The sensor node and its
firmware belong to ANOTHER TEAM. Treat its payload as an external contract that WILL change.

## Governance

Binding principles live in `.specify/memory/constitution.md`. Read it before
`/speckit-plan` and `/speckit-analyze`; never restate it here. Seven: Offline por Padrão ·
Orçamento de Desempenho · Leituras Imutáveis · O Payload é Externo · Ergonomia de Campo ·
Honestidade do Dado · Spec Antes do Código. Spec Kit commands are Agent Skills here —
invoke with a HYPHEN: `/speckit-plan`.

## Commands — feature 001 creates these; only the non-obvious are listed

    pnpm dev:mobile   expo start --dev-client (Expo Go will NOT work — BLE)
    pnpm test         vitest; sync + ingest run against better-sqlite3
    pnpm lint         eslint + the transport-boundary import rule
    pnpm i18n:check   fails on hardcoded UI strings or missing pt-BR keys
    pnpm size         size-limit; fails CI over budget

## Repository layout

    packages/core/    domain types, VERSIONED DECODER, i18n. Zero platform imports.
    packages/db/      one Drizzle schema -> expo-sqlite, better-sqlite3, pg
    apps/mobile/src/transports/  ble | cable | file | mock.
                                 ONLY place that may import a transport SDK.
    apps/mobile/src/{data,sync,ui}/  local DB · resumable upload · screens
    apps/web/         Vite dashboard. ONLINE-ONLY. No local DB, no sync engine.
    specs/            Spec Kit feature dirs
    docs/integracao-firmware.md   what the other team CONFIRMED, with dates

## Non-negotiables (the ones agents actually break)

- IMPORTANT: eCO2 is NOT CO2 — it is derived from VOCs. Never label it CO2 in UI, chart
  or export. Primary gas signal is TVOC, always relative to the hive's own baseline.
  Never compare absolute VOC across hives.
- Never call the network in a render path. Offline is the default state.
- Never UPDATE or DELETE rows in the readings table. Append-only.
- Primary key is `(node_id, seq)`. `boot_id` is a payload field, NEVER part of the key.
  A gap in `seq` is normal, not data loss. Re-importing a payload must be a no-op.
- Store the node's raw counter immutably; UTC time is derived and carries a quality flag.
- Missing values are NULL + reason. Never `0` / `-1` / `-999`.
- Store raw sensor values; calibration and offsets are separate fields applied at render,
  so the series can be recomputed later. Rounding on write destroys that forever.
- Charts show excluded periods as GAPS. Never interpolate across invalid data.
- Never hardcode a payload layout outside `decodeVn`. Always keep the raw pull.
- Nothing in `ui/` or `core/` may import a transport SDK.
- No user-facing string outside the i18n module. pt-BR is the source locale.
- Touch targets >= 56dp, body >= 16sp, readings >= 32sp, primary contrast >= 7:1.
- No animation library, no component kit, no chart library, no webfonts, no blur.

## Performance

Reference device: Android 9, 2 GB RAM, Snapdragon 425/430, 16 GB at ~90% full. Every
launch is a cold launch — there is no warm-start budget. Cold start <= 3.5 s p50 / 5.0 s
p95. Peak TOTAL PSS <= 150 MB. No UI-thread block > 100 ms. Local DB ceiling 150 MB.
PROVISIONAL until feature 001 measures them; full table in the constitution.

## Domain vocabulary (pt-BR) — source of truth `docs/glossario.md`

    colmeia = hive | apiário (Apis) / meliponário (sem ferrão) = the site
    ninho = brood chamber | melgueira = honey super
    Apis only: quadro, favo, enxameação
    Meliponíneos only: discos de cria, potes de alimento, cerume, batume
    revisão / inspeção = a visit | coleta = pulling data off the node
    nó sensor = the sensor node | leitura = one reading (never "sample")
    voláteis / COVs = the gas channel (NEVER "CO2")

NEVER write "hive", "device", "sync", "sample" in UI copy.
NEVER ask a meliponicultor about "quadros" — they do not exist in a stingless bee nest.

## Workflow

`/speckit-specify` -> clarify -> plan -> checklist -> tasks -> analyze -> implement ->
converge. Constitution ratified at 1.0.0. Branch `<tipo>/<NNN>-<slug>`, NNN matches
`specs/`. Spec before code for any user-visible behaviour change. `.specify/feature.json`
is COMMITTED — feature state is not branch-derived in 0.12.7. PR must report the
airplane-mode test result and a 7-row Constitution Check.

## Gotchas — grows by evidence only

- The node payload is another team's contract and will change. See
  `docs/integracao-firmware.md` for CONFIRMED vs ASSUMED.
- The gas sensor's heater can bias the temperature sensor by +4…+6 °C on combined boards.
  Check the heater flag before trusting a temperature, if firmware sends one.
- BLE does not work in the iOS Simulator at all. iOS BLE needs a real iPhone.
- Android 8-10: BLE scan silently returns ZERO results if the system Location toggle is
  off, even with permission granted. The preflight screen is P0, not polish.
- Android throttles an app to 5 scans / 30 s. Debounce "Procurar" to 1 per 6 s.
- Android 8/9 GATT connect throws status=133 constantly: stopScan, wait ~200ms,
  autoConnect=false, refresh cache, retry with backoff, single GATT queue.
- `androidNeverForLocation` does nothing on Android 8/9/10 — it is API 31+ only.
- Web Bluetooth does not exist on iOS Safari. The web build never ingests over BLE;
  cable (Web Serial, desktop Chrome) is its only ingestion path.
