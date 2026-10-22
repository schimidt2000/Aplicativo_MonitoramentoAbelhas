#!/usr/bin/env bash
# Roda os scripts do servidor contra um Postgres DESCARTÁVEL e confere:
#   1. golden.sql — o caso de referência do código do projeto e do resumo
#      diário (os MESMOS arquivos de servidor/golden/ que o vitest usa contra
#      o celular);
#   2. rls.sql    — o teste de NEGAÇÃO: o celular de A recebe zero linhas de B,
#      leitura não aceita UPDATE nem DELETE, e o resto do que 002_rls.sql promete.
#
# Precisa de initdb, pg_ctl e psql no PATH (Postgres 15 ou mais novo, por causa
# de `security_invoker` nas visões). Não usa rede: o servidor escuta só num
# socket dentro de um diretório temporário, apagado no fim.
#
#   npm run servidor:teste
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
servidor="$(cd "$aqui/.." && pwd)"

for prog in initdb pg_ctl psql; do
  if ! command -v "$prog" >/dev/null 2>&1; then
    echo "Postgres local não encontrado ($prog). Instale o Postgres 15+ para rodar este teste."
    exit 2
  fi
done

# Caminho curto: o socket Unix tem limite de ~100 caracteres no macOS.
base="$(mktemp -d /tmp/beepg.XXXXXX)"
porta=54329
limpar() {
  pg_ctl -D "$base/dados" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$base"
}
trap limpar EXIT

# No macOS o postmaster recusa subir sem um locale válido no ambiente.
export LC_ALL="${LC_ALL:-C}"
initdb -D "$base/dados" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$base/dados" -l "$base/log" -w \
  -o "-k $base -p $porta -c listen_addresses='' -c fsync=off" start >/dev/null

banco() {
  PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}" \
    psql -h "$base" -p "$porta" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -o /dev/null "$@"
}

# Testes: o resultado das consultas não interessa, só os avisos "ok: ..." e a
# primeira falha. Cada asserção sai como uma linha.
testar() {
  PGOPTIONS="-c client_min_messages=notice" banco "$@" 2>&1 \
    | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /  /'
}

aplicar() {
  banco "$@" -f "$aqui/supabase-local.sql"
  banco "$@" -f "$aqui/apoio.sql"
  banco "$@" -f "$servidor/001_schema.sql"
  banco "$@" -f "$servidor/002_rls.sql"
  banco "$@" -f "$servidor/003_seed.sql"
  banco "$@" -f "$servidor/004_lgpd.sql"
}

echo "Aplicando os scripts do servidor, uma vez, como num projeto novo..."
aplicar

echo "Caso de referência (servidor/golden/)..."
testar -v golden_codigos="$(cat "$servidor/golden/codigos.json")" \
       -v golden_resumo="$(cat "$servidor/golden/resumo-diario.json")" \
       -f "$aqui/golden.sql"

echo "Acesso e negação (RLS)..."
testar -f "$aqui/rls.sql"

echo "Esquema e privilégios..."
testar -f "$aqui/esquema.sql"

echo "Reaplicando os scripts num segundo banco (não podem quebrar nem abrir acesso)..."
banco -c "create database reaplicar"
aplicar -d reaplicar
banco -d reaplicar -f "$servidor/001_schema.sql"
banco -d reaplicar -f "$servidor/002_rls.sql"
banco -d reaplicar -f "$servidor/004_lgpd.sql"
testar -d reaplicar -f "$aqui/esquema.sql"

echo "Servidor OK."
