#!/usr/bin/env bash
# Carga (o recarga) la base de producción en el Supabase de PRUEBAS, desde el
# espejo que ya corre en SRPY186 (apps/mirror → base renewsubastas_mirror).
#
#   bash infra/supabase-renew/load-from-mirror.sh           # upsert: conserva lo creado en pruebas
#   RESET=1 bash infra/supabase-renew/load-from-mirror.sh   # copia exacta: vacía y recarga
#
# Pasos:
#   1. esquema (sql/001_schema.sql) y área de trabajo (sql/010_legacy.sql)
#   2. COPY de las tablas crudas del espejo a legacy.* — tubería entre los dos
#      contenedores de Postgres, sin abrir red ni pasar credenciales entre bases
#   3. transformación a las tablas de public (sql/100_load_from_mirror.sql)
#   4. conteos: cada tabla contra su colección en el espejo
#
# Solo lee del espejo. Todo corre dentro del servidor; nada se publica.
set -euo pipefail

HOST="${HOST:-srpy-servidor}"
RESET="${RESET:-0}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL_RENEW='docker exec -i renew-supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q'

log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

log "1/4 esquema"
ssh "$HOST" "$PSQL_RENEW" < "$DIR/sql/001_schema.sql"
ssh "$HOST" "$PSQL_RENEW" < "$DIR/sql/010_legacy.sql"
echo "   listo"

log "2/4 tablas crudas del espejo → legacy.*"
# Sin -i en los comandos que no leen stdin (y </dev/null): en un script que
# llega por ssh, un docker exec -i se come el resto (pasó con pgweb).
ssh "$HOST" 'set -euo pipefail
  U="$(docker exec srpy-postgres printenv POSTGRES_USER)"
  docker exec renew-supabase-db psql -U postgres -d postgres -qc "truncate legacy.fs_documents, legacy.auth_users" </dev/null
  docker exec srpy-postgres psql -U "$U" -d renewsubastas_mirror -qc "\copy (select path, collection, doc_id, parent_path, data::text from fs_documents where deleted_at is null) to stdout with (format csv)" </dev/null \
    | docker exec -i renew-supabase-db psql -U postgres -d postgres -qc "\copy legacy.fs_documents from stdin with (format csv)"
  docker exec srpy-postgres psql -U "$U" -d renewsubastas_mirror -qc "\copy (select uid, email, email_verified, phone, display_name, photo_url, disabled, providers::text, custom_claims::text, created_at, last_sign_in_at from auth_users where deleted_at is null) to stdout with (format csv)" </dev/null \
    | docker exec -i renew-supabase-db psql -U postgres -d postgres -qc "\copy legacy.auth_users from stdin with (format csv)"
  docker exec renew-supabase-db psql -U postgres -d postgres -Atc "select count(*) || '"'"' documentos, '"'"'|| (select count(*) from legacy.auth_users) || '"'"' cuentas'"'"' from legacy.fs_documents" </dev/null | sed "s/^/   /"'

if [[ "$RESET" == 1 ]]; then
  log "   RESET=1: vaciando las tablas de public para una copia exacta"
  ssh "$HOST" "docker exec renew-supabase-db psql -U postgres -d postgres -qc 'truncate public.profiles, public.vehicles, public.vehicle_images, public.auctions, public.auction_private, public.bids, public.auction_viewers, public.price_changes, public.favorites, public.app_config, public.audit_logs, public.notifications, public.password_reset_requests, public.page_views, public.traffic_daily cascade' </dev/null"
fi

log "3/4 transformación"
ssh "$HOST" "$PSQL_RENEW" < "$DIR/sql/100_load_from_mirror.sql"
echo "   listo"

log "4/4 conteos: Supabase de pruebas vs espejo"
ssh "$HOST" 'set -euo pipefail
  U="$(docker exec srpy-postgres printenv POSTGRES_USER)"
  mirror() { docker exec srpy-postgres psql -U "$U" -d renewsubastas_mirror -Atc "select count(*) from fs_documents where deleted_at is null and collection = '"'"'$1'"'"'" </dev/null; }
  renew() { docker exec renew-supabase-db psql -U postgres -d postgres -Atc "select count(*) from public.$1" </dev/null; }
  printf "   %-26s %8s %8s\n" tabla supabase espejo
  for pair in profiles:users vehicles:vehicles auctions:auctions bids:bids auction_viewers:viewers auction_private:private app_config:app_config audit_logs:audit_logs notifications:notifications password_reset_requests:password_reset_requests page_views:page_views traffic_daily:insights_traffic_daily; do
    t="${pair%%:*}"; c="${pair##*:}"
    printf "   %-26s %8s %8s\n" "$t" "$(renew "$t")" "$(mirror "$c")"
  done
  printf "   %-26s %8s\n" vehicle_images "$(renew vehicle_images)"
  printf "   %-26s %8s\n" favorites "$(renew favorites)"'
