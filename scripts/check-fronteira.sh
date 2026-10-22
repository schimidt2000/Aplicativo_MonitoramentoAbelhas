#!/usr/bin/env bash
# Verifica as fronteiras que a constituição exige, por comando e não por promessa.
set -u
falhou=0

erro() { echo "FALHA: $1"; falhou=1; }

# Princípio IV — só transports/ e nuvem/ podem importar SDK de fronteira.
fora=$(grep -rlE "from '(expo-sqlite|react-native-ble-plx|@supabase)" \
        src --include='*.ts' --include='*.tsx' 2>/dev/null \
        | grep -vE '^src/(transports|nuvem|data/db)' || true)
[ -n "$fora" ] && erro "SDK de fronteira importado fora de transports/ e nuvem/:
$fora"

# Princípio IV — a porta serial do navegador (Web Serial) só em transports/.
# Pega também o acesso por conversão de tipo ou índice — `(navigator as X).serial`,
# `nav?.serial`, `navigator['serial']` — e não só o literal `navigator.serial`.
serial=$(grep -rnE "\.serial\b|\[[[:space:]]*['\"]serial['\"][[:space:]]*\]|['\"]serial['\"][[:space:]]+in\b|requestPort\(|getPorts\(" \
          src --include='*.ts' --include='*.tsx' 2>/dev/null \
          | grep -vE '^src/transports/' || true)
[ -n "$serial" ] && erro "porta serial acessada fora de transports/:
$serial"

# CLAUDE.md e feature 005 — `src/core` é domínio puro: zero import de plataforma
# (react, react-native, expo-*), de transporte, de banco, de tela. A máquina de
# estados do cabo só é testável sem porta porque mora aqui.
nucleo=$(grep -rnE "from '(react|react-native|react-native-[^']+|expo|expo-[^']+|@/(transports|data|ui|app|nuvem)(/[^']*)?)'|from '(\.\./)+(transports|data|ui|app|nuvem)(/[^']*)?'|require\(" \
          src/core --include='*.ts' --include='*.tsx' 2>/dev/null || true)
[ -n "$nucleo" ] && erro "src/core importando plataforma, transporte, banco ou tela:
$nucleo"

# Princípio III — o único UPDATE permitido em `reading` toca só `synced_at`.
mau=$(grep -rn "UPDATE reading" src --include='*.ts' 2>/dev/null \
      | grep -v 'SET synced_at' || true)
[ -n "$mau" ] && erro "UPDATE em reading fora da exceção de synced_at:
$mau"
del=$(grep -rn "DELETE FROM reading\b" src --include='*.ts' 2>/dev/null || true)
[ -n "$del" ] && erro "DELETE em reading é proibido:
$del"
# Feature 003: a única reconstrução de `reading` é a migração versionada, com
# cópia conferida (specs/003-hora-das-leituras/plan.md, Complexity Tracking).
drop=$(grep -rn "DROP TABLE reading\b" src --include='*.ts' 2>/dev/null \
       | grep -v '^src/data/migracoes.ts' || true)
[ -n "$drop" ] && erro "DROP de reading fora de src/data/migracoes.ts:
$drop"

# Restrições de Plataforma — o painel não pode ter banco local nem motor de envio.
if [ -d painel/src ]; then
  banco=$(grep -rlE "sql\.js|indexedDB|expo-sqlite|data/sync" painel/src 2>/dev/null || true)
  [ -n "$banco" ] && erro "painel/ contém banco local ou motor de envio:
$banco"
fi

# Princípio VI — nada pode rotular o canal de gás como CO2.
co2=$(grep -rn "eco2" src --include='*.tsx' 2>/dev/null | grep -iE "CO₂|CO2" || true)
[ -n "$co2" ] && erro "eco2 sendo rotulado como CO2 em tela:
$co2"

# FR-023 — nenhuma credencial administrativa no app de campo, e o SDK do
# Supabase fica fora dele (decisão de Princípio II, specs/002-envio-e-painel/plan.md).
sdk=$(grep -nE '"@supabase/' package.json 2>/dev/null || true)
[ -n "$sdk" ] && erro "@supabase/* no package.json do app de campo (o cliente é fetch puro):
$sdk"
segredo=$(grep -rnE "sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}" \
          src app.json 2>/dev/null || true)
[ -n "$segredo" ] && erro "chave ou token embutido no código do app:
$segredo"

# Servidor — sem coluna de coordenada (FR-022) e sem política de UPDATE/DELETE
# em reading (Princípio III). Comentários SQL são ignorados.
if ls servidor/*.sql >/dev/null 2>&1; then
  # `_` conta como separador: `lat_e6`, `apiary_lon` e `latitude_e7` também
  # são coordenada (o `\b` deixava passar, porque `_` é letra para ele).
  geo=$(sed 's/--.*$//' servidor/*.sql \
        | grep -niE "(^|[^a-z0-9])(lat|lon|lng|latitude|longitude)([^a-z0-9]|$)" || true)
  [ -n "$geo" ] && erro "coluna de coordenada no esquema do servidor:
$geo"
  # Uma política por comando (corta no `;`). Em `reading`, só FOR SELECT ou
  # FOR INSERT passam: sem FOR a política vale para ALL, e `AS PERMISSIVE`
  # pode vir antes do FOR.
  pol=$(sed 's/--.*$//' servidor/*.sql | tr '\n' ' ' | tr ';' '\n' | tr -s ' ' \
        | grep -iE "create policy (\"[^\"]+\"|[a-z0-9_]+) on (public\.)?\"?reading\"?( |$)" \
        | grep -viE " for (select|insert)( |$)" || true)
  [ -n "$pol" ] && erro "política de UPDATE/DELETE em reading no servidor:
$pol"
fi

[ "$falhou" -eq 0 ] && echo "Fronteiras OK." || exit 1
