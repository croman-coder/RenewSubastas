#!/usr/bin/env bash
# Importa las cuentas de Firebase Auth al GoTrue del Supabase de PRUEBAS, con
# sus contraseñas actuales (hash scrypt de Firebase) y sus cuentas de Google.
#
#   bash infra/supabase-renew/import-auth.sh
#
# Requiere haber corrido load-from-mirror.sh antes (lee rol/estado/audiencia
# de public.profiles) y la sesión de `firebase login` de esta máquina.
#
# Todo lo sensible (exportación con hashes, clave firmante, CSV) vive en un
# directorio temporal 700 que se borra al salir pase lo que pase; en el
# servidor, la tabla de paso se vacía al terminar. Nada se imprime.
set -euo pipefail

HOST="${HOST:-srpy-servidor}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL_RENEW='docker exec -i renew-supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q'
umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

log "1/4 exportación de Firebase Auth (con hashes)"
firebase auth:export "$WORK/export.json" --format=json --project carbid-staging >/dev/null
node "$DIR/firebase-hash-config.mjs" > "$WORK/hash.json"
node "$DIR/firebase-auth-to-csv.mjs" "$WORK/export.json" "$WORK/hash.json" > "$WORK/import.csv"
echo "   $(wc -l < "$WORK/import.csv") cuentas convertidas"

log "2/4 tabla de paso en el servidor"
ssh "$HOST" "$PSQL_RENEW" < "$DIR/sql/010_legacy.sql"
ssh "$HOST" "docker exec renew-supabase-db psql -U postgres -d postgres -qc 'truncate legacy.auth_import' </dev/null"
ssh "$HOST" "docker exec -i renew-supabase-db psql -U postgres -d postgres -qc '\\copy legacy.auth_import from stdin with (format csv)'" < "$WORK/import.csv"

log "3/4 auth.users + auth.identities"
ssh "$HOST" "$PSQL_RENEW" < "$DIR/sql/200_import_auth.sql"

log "4/4 conteos"
ssh "$HOST" "docker exec renew-supabase-db psql -U postgres -d postgres -At </dev/null -c \"
  select 'cuentas: ' || count(*) from auth.users where email not like '%@renew.test';
  select 'con contraseña (fbscrypt): ' || count(*) from auth.users where encrypted_password like '\\\$fbscrypt\\\$%';
  select 'identidades google: ' || count(*) from auth.identities where provider = 'google';
  select 'identidades email: ' || count(*) from auth.identities where provider = 'email';
  select 'perfiles sin cuenta: ' || count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id);
  select 'tabla de paso vacía: ' || (count(*) = 0) from legacy.auth_import;\"" | sed 's/^/   /'
