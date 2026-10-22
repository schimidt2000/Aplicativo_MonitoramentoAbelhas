#!/usr/bin/env bash
# FR-032 e Restrições de Plataforma: o painel NÃO tem banco local nem motor de
# envio. Verificado por comando, não por promessa. Roda de dentro de painel/
# ou da raiz do repositório.
set -u
cd "$(dirname "$0")/.."
falhou=0
erro() { echo "FALHA: $1"; falhou=1; }

# 1. Código do painel: nenhum banco embarcado, nenhum armazenamento estruturado
#    do navegador, nenhum motor de envio do app de campo.
achados=$(grep -rnE "sql\.js|indexedDB|expo-sqlite|src/data/sync" src 2>/dev/null || true)
[ -n "$achados" ] && erro "banco local ou motor de envio em painel/src:
$achados"

# 2. Dependências: nenhum pacote de banco local ou de cache offline.
deps=$(grep -nE '"(sql\.js|expo-sqlite|better-sqlite3|dexie|idb|idb-keyval|localforage|pouchdb[^"]*|rxdb|@electric-sql/[^"]*|workbox[^"]*|vite-plugin-pwa)"' package.json || true)
[ -n "$deps" ] && erro "dependência de banco local ou cache offline em painel/package.json:
$deps"

# 3. Nenhum service worker: o painel é online e não guarda dado entre visitas.
sw=$(grep -rnE "serviceWorker|caches\.open" src index.html 2>/dev/null || true)
[ -n "$sw" ] && erro "service worker ou cache de dados no painel:
$sw"

# 4. Artefato separado: nada do app de campo é importado, nem por import
#    estático, nem por re-export, nem por import dinâmico (que traria o banco
#    do app de campo para o navegador sem aparecer como "from").
cruzado=$(grep -rnE "(from|import\()[[:space:]]*['\"](\.\./)+(\.\./)src/|(from|import\()[[:space:]]*['\"]@/" src 2>/dev/null || true)
[ -n "$cruzado" ] && erro "o painel importa código do app de campo:
$cruzado"

[ "$falhou" -eq 0 ] && echo "Painel sem banco local: OK." || exit 1
