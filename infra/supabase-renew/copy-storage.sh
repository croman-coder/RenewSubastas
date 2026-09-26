#!/usr/bin/env bash
# Copia los archivos de Firebase Storage (fotos de vehículos y comprobantes de
# pago) al Storage del Supabase de PRUEBAS.
#
#   bash infra/supabase-renew/copy-storage.sh
#
# Parte de la copia local que ya mantiene el espejo (renew-mirror baja cada
# archivo a /home/santarosa/stack/renew-mirror/storage), así que no toca
# Firebase. Buckets:
#   vehicles        público (las fotos se ven en el catálogo sin sesión)
#   payment-proofs  privado (solo internos, como hoy en storage.rules)
# Sube con x-upsert: repetible. Todo por la API interna (127.0.0.1:8110).
set -euo pipefail

HOST="${HOST:-srpy-servidor}"

ssh "$HOST" 'bash -s' <<'REMOTE'
  set -euo pipefail
  cd /home/santarosa/stack/supabase-renew
  SRV="$(sed -n 's/^SERVICE_ROLE_KEY=//p' .env)"
  U="$(docker exec srpy-postgres printenv POSTGRES_USER)"
  BASE=/home/santarosa/stack/renew-mirror/storage/carbid-staging.firebasestorage.app
  docker exec renew-supabase-db psql -U postgres -d postgres -qc \
    "insert into storage.buckets (id, name, public) values ('vehicles', 'vehicles', true), ('payment-proofs', 'payment-proofs', false) on conflict (id) do update set public = excluded.public" </dev/null
  ok=0; fail=0; missing=0
  # Reads from the process substitution, never from stdin: this script itself
  # arrives on stdin (ssh bash -s).
  while IFS='|' read -r name ctype; do
    bucket="${name%%/*}"
    path="${name#*/}"
    file="$BASE/$name"
    if [[ ! -f "$file" ]]; then missing=$((missing + 1)); echo "   sin copia local: $name"; continue; fi
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      "http://127.0.0.1:8110/storage/v1/object/$bucket/$path" \
      -H "Authorization: Bearer $SRV" -H "apikey: $SRV" \
      -H "Content-Type: $ctype" -H "x-upsert: true" --data-binary "@$file")"
    if [[ "$code" == 200 ]]; then ok=$((ok + 1)); else fail=$((fail + 1)); echo "   falló ($code): $bucket/$path"; fi
  done < <(docker exec srpy-postgres psql -U "$U" -d renewsubastas_mirror -At -F '|' -c \
    "select name, coalesce(content_type, 'application/octet-stream') from storage_objects where deleted_at is null order by name" </dev/null)
  echo "   subidos: $ok · fallidos: $fail · sin copia local: $missing"
  docker exec renew-supabase-db psql -U postgres -d postgres -At </dev/null -c \
    "select '   bucket ' || bucket_id || ': ' || count(*) || ' archivos' from storage.objects group by bucket_id order by bucket_id"
REMOTE
