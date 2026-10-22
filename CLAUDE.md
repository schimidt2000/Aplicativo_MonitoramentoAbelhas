# Bee-sertão

Offline-first app that pulls hive microclimate data (temperature, humidity, gas, battery)
off a sensor node at the hive, stores it in SQLite, and syncs it later for specialists to
analyse. Users are beekeepers in the Brazilian semi-arid, on low-end Android phones.

**Scope boundary:** this team owns everything from the moment the phone reaches the hive —
transport, decoding, local DB, sync, UI, export, painel. The sensor node and its
firmware belong to ANOTHER TEAM. Treat its payload as an external contract that WILL change.

## Governance

Binding principles live in `.specify/memory/constitution.md` (read it before `/speckit-plan`
and `/speckit-analyze`; never restate it here). Seven: Offline por Padrão · Orçamento de
Desempenho · Leituras Imutáveis · O Payload é Externo · Ergonomia de Campo · Honestidade do
Dado · Spec Antes do Código. Spec Kit commands are Agent Skills — HYPHEN: `/speckit-plan`.

## Commands

    npm run web              expo start --web  (a demo de aula roda aqui)
    npm run android          expo start --android
    npm run typecheck        tsc --noEmit
    npm test                 vitest (inclui tests/telas.test.ts: texto literal em .tsx reprova)
    npm run check:fronteira  importação de transporte, CO2, segredos, esquema do servidor
    npm run servidor:teste   servidor/*.sql num Postgres 15+ local descartável (initdb/psql)
    cd painel && npm run dev | build | test | check:sem-banco   (package.json próprio)

## Repository layout

    src/core/        domínio puro. ZERO import de plataforma.
      ports/         interfaces Transport e ClienteNuvem
      decode/        decodificador versionado (versão -> parser)
      coleta/ envio/ erro -> problema e mensagens da coleta; mensagens do envio
      hora/ bancada/ hora por ligada (003); leitor de linhas bancada0 do cabo (004)
      i18n/          pt-BR.ts: TODO texto de tela, um bloco por frente
      format/        formatação pt-BR; precisão nunca acima da exatidão do sensor
      relogio.ts · preferencias.ts · codigo-projeto.ts   hora plausível; Ajustes; XXXX-XXXX
    src/transports/  mock e cable (monitor de bancada, 004; coleta pelo cabo, 005).
                     ONLY place that may import a transport SDK.
    src/nuvem/       mock e supabase (fetch puro, sem SDK). Escolha em index.ts.
    src/data/        ddl, migracoes (user_version), hora, repo, ingest, sync, coleta (nunca
                     lança), semente (demo), provider.tsx. Metro: db.*; TS: db.d.ts.
    src/ui/          tokens, Grafico, ModoSol, PerguntaHora, demo.ts (ROTULO_DEMO)
    src/app/         rotas: (tabs)/{index,coletar,enviar,ajustes}, diagnostico, cabo,
                     vincular, colmeia/[id]
    tests/           vitest do app de campo; scripts/  check-fronteira.sh
    servidor/        Postgres + RLS (001..004.sql), teste/, lgpd/, golden/. Fora do Metro.
    painel/          painel das pesquisadoras (Vite). Sem banco local. Fora do Metro.
    public/          sql-wasm*.wasm servidos localmente (nunca CDN - Princípio I)
    specs/           features do Spec Kit
    docs/            integracao-firmware (CONFIRMADO vs ASSUMIDO), questionario, mensagem, glossario

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
PROVISIONAL: medir no aparelho de referência (T065/T041/T026); full table in the constitution.

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
converge. Constitution ratified at 1.1.0. Branch `<tipo>/<NNN>-<slug>`, NNN matches
`specs/`. Spec before code for any user-visible behaviour change. `.specify/feature.json`
is COMMITTED — feature state is not branch-derived in 0.12.7. PR must report the
airplane-mode test result and a 7-row Constitution Check.

## Gotchas — grows by evidence only

- The payload is another team's contract (CONFIRMED vs ASSUMED: `docs/integracao-firmware.md`).
  Firmware e93f8ad (2026-10-21): o id da medição ZERA a cada coleta e a placa apaga o
  arquivo após SESSION_COMPLETE; (node_id, id) colide entre coletas — a placa real só entra
  pela tela "Coletar pelo cabo" (005: seq = início×1e6 + id), nunca pelo Coletar das abas,
  que é o mock. A hora do celular vai DEPOIS da transferência, em segundos Unix.
- The node has NO clock of its own (firmware group, 2026-10-14). In THIS branch (modelo da
  003, mock) the phone offers UTC time via `setTime` before every pull — best effort, 5 s
  cap, never blocks the pull, never sent if `core/relogio.ts` finds the phone clock
  implausible. Reading time comes from anchor + `tNode`; `seq` decides what was collected.
- A pull never fails silently: `data/coleta.ts` never throws, isolates each hive, and maps
  `TransportError` + phase to a problem code that `core/coleta/mensagens.ts` explains.
- The gas sensor's heater can bias the temperature sensor by +4…+6 °C on combined boards.
  Check the heater flag before trusting a temperature, if firmware sends one.
- The time a reading SHOWS lives in the VIEW `leitura_hora`, not in `reading.t_utc_ms`
  (NULL for every reading ingested since feature 003: time is evaluated per boot at the end
  of a pull and stored as a correction). Any series query must read the view.
- `resumosDiarios` returns ONLY days that have a row. A missing day arrives as an
  absent element, not a null — so any chart must break the line on a day-number
  discontinuity too, or it silently interpolates across untaken measurements.
- expo-sqlite does NOT work in the browser (5 measured failure modes; drizzle's
  expo-sqlite driver is sync and needs SharedArrayBuffer, which is absent).
  Web uses sql.js. See specs/001-coleta-offline/research.md D-001.
- sql.js asks for `sql-wasm-browser.wasm`, not `sql-wasm.wasm`. Both live in public/,
  never on a CDN — offline is the default state (Princípio I).
- `<Link asChild>` rejects style arrays: wrap in StyleSheet.flatten.
- BLE does not work in the iOS Simulator at all. iOS BLE needs a real iPhone.
- Android 8-10: BLE scan silently returns ZERO results if the system Location toggle is
  off, even with permission granted. The preflight screen is P0, not polish.
- Android throttles an app to 5 scans / 30 s. Debounce "Procurar" to 1 per 6 s.
- Android 8/9 GATT connect throws status=133 constantly: stopScan, wait ~200ms,
  autoConnect=false, refresh cache, retry with backoff, single GATT queue.
- `androidNeverForLocation` does nothing on Android 8/9/10 — it is API 31+ only.
- Web Bluetooth does not exist on iOS Safari. The web build never ingests over BLE;
  cable (Web Serial, desktop Chrome) is its only ingestion path.
