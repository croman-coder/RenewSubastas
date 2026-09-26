#!/usr/bin/env bash
# Crea (o actualiza) el Supabase de PRUEBAS de Renew Subastas en SRPY186.
#
#   bash infra/supabase-renew/deploy-to-srpy186.sh
#
# Diseño: docs/superpowers/specs/2026-09-26-servidor-propio-design.md. Es un
# entorno de pruebas con la base completa de producción; NO reemplaza a
# producción.
#
# Qué hace:
#   1. Si /home/santarosa/stack/supabase-renew no existe, lo arma copiando la
#      CONFIGURACIÓN oficial del stack supabase-crm (misma versión que los demás
#      stacks del servidor) — nunca sus datos, su .env, sus plantillas ni sus
#      snippets — y renombra proyecto, contenedores y puertos:
#        proyecto  supabase-renew     contenedores  renew-supabase-*
#        Kong      127.0.0.1:8110     Studio        127.0.0.1:8111
#        Postgres  127.0.0.1:5439     pooler        127.0.0.1:6549
#   2. Genera secretos nuevos con los scripts oficiales (utils/generate-keys.sh y
#      add-new-auth-keys.sh) sin mostrarlos, y ajusta URLs y registro cerrado.
#   3. docker compose up -d y espera a que la base y la API respondan.
#   4. Copia a ESTA máquina, en ~/keys/supabase-renew.env (600), solo lo que
#      hace falta para la carga de datos y la futura web: claves anon y
#      service_role, contraseña de Postgres y acceso a Studio. Nunca en pantalla.
#
# Deliberadamente NO publica nada: la base va a tener datos personales reales
# (cédulas, teléfonos, correos, datos bancarios). Todo escucha en 127.0.0.1 del
# servidor. Studio se abre con:
#   ssh -L 8111:127.0.0.1:8111 srpy-servidor   →  http://localhost:8111
# Los nombres públicos (subastas / api-subastas.santarosa.lat) se agregan cuando
# exista la web de prueba y Cloudflare Access los cubra.
set -euo pipefail

HOST="${HOST:-srpy-servidor}"
SRC=/home/santarosa/stack/supabase-crm
DST=/home/santarosa/stack/supabase-renew
LOCAL_KEYS="$HOME/keys/supabase-renew.env"

log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

log "1/4 stack supabase-renew (solo configuración, sin datos de otro stack)"
ssh "$HOST" "SRC='$SRC' DST='$DST' bash -s" <<'REMOTE'
  set -euo pipefail
  if [[ -f "$DST/.env" ]]; then
    echo "   ya existe $DST/.env: no toco secretos ni configuración"
    exit 0
  fi
  for p in 8110 8111 5439 6549; do
    if ss -ltn | grep -q "127.0.0.1:$p "; then echo "   ERROR: el puerto $p ya está en uso"; exit 1; fi
  done
  mkdir -p "$DST"
  tar -C "$SRC" \
    --exclude=./.env --exclude='./.env.*[!e]' --exclude='./*.old' \
    --exclude=./docker-compose.crm.yml \
    --exclude=./volumes/db/data --exclude=./volumes/storage \
    --exclude=./volumes/plantillas-correo --exclude=./volumes/snippets \
    --exclude='./volumes/db/init/*' \
    -cf - . | tar -C "$DST" -xf -
  mkdir -p "$DST/volumes/db/init" "$DST/volumes/snippets" "$DST/volumes/storage"
  : > "$DST/volumes/db/init/data.sql"
  cd "$DST"
  # Proyecto, contenedores y puertos propios. kong.yml enruta a realtime por
  # nombre de contenedor, así que va en la misma pasada.
  sed -i \
    -e 's/^name: supabase-crm$/name: supabase-renew/' \
    -e 's/crm-supabase-/renew-supabase-/g' \
    -e 's/"127.0.0.1:8108:3000"/"127.0.0.1:8111:3000"/' \
    -e 's/127.0.0.1:5438:5432/127.0.0.1:5439:5432/' \
    docker-compose.yml
  sed -i 's/crm-supabase-/renew-supabase-/g' volumes/api/kong.yml
  if grep -q "crm" docker-compose.yml volumes/api/kong.yml; then
    echo "   ERROR: quedaron menciones a crm:"; grep -n "crm" docker-compose.yml volumes/api/kong.yml; exit 1
  fi
  cp .env.example .env
  chmod 600 .env
  sh utils/generate-keys.sh --update-env >/dev/null
  sh utils/add-new-auth-keys.sh --update-env >/dev/null
  setv() { # setv CLAVE valor — reemplaza o agrega, sin mostrar nada
    if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
  }
  # Any secret the official generators didn't cover would still hold the
  # public example value from .env.example: regenerate those here, with the
  # length each service requires (realtime's key must be exactly 16 chars).
  fresh() { # fresh CLAVE comando — solo si sigue igual al ejemplo
    local cur ex
    cur="$(sed -n "s/^$1=//p" .env)"
    ex="$(sed -n "s/^$1=//p" .env.example)"
    if [[ -z "$cur" || "$cur" == "$ex" ]]; then setv "$1" "$(eval "$2")"; echo "   $1: regenerado"; fi
  }
  fresh POSTGRES_PASSWORD 'openssl rand -hex 24'
  fresh SECRET_KEY_BASE 'openssl rand -base64 48 | tr -d "\n/+="'
  fresh VAULT_ENC_KEY 'openssl rand -hex 16'
  fresh PG_META_CRYPTO_KEY 'openssl rand -hex 16'
  fresh REALTIME_DB_ENC_KEY 'openssl rand -hex 8'
  fresh LOGFLARE_PUBLIC_ACCESS_TOKEN 'openssl rand -hex 32'
  fresh LOGFLARE_PRIVATE_ACCESS_TOKEN 'openssl rand -hex 32'
  fresh S3_PROTOCOL_ACCESS_KEY_ID 'openssl rand -hex 16'
  fresh S3_PROTOCOL_ACCESS_KEY_SECRET 'openssl rand -hex 32'
  fresh MINIO_ROOT_PASSWORD 'openssl rand -hex 16'
  for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY; do
    if [[ "$(sed -n "s/^$k=//p" .env)" == "$(sed -n "s/^$k=//p" .env.example)" ]]; then
      echo "   ERROR: $k quedó con el valor de ejemplo"; exit 1
    fi
  done
  setv COMPOSE_FILE docker-compose.yml
  setv KONG_HTTP_PORT 127.0.0.1:8110
  setv KONG_HTTPS_PORT 127.0.0.1:8450
  setv POOLER_PROXY_PORT_TRANSACTION 127.0.0.1:6549
  setv POOLER_TENANT_ID renew
  setv SITE_URL https://subastas.santarosa.lat
  setv API_EXTERNAL_URL https://api-subastas.santarosa.lat
  setv SUPABASE_PUBLIC_URL https://api-subastas.santarosa.lat
  setv DISABLE_SIGNUP true
  setv ENABLE_EMAIL_AUTOCONFIRM false
  setv ENABLE_ANONYMOUS_USERS false
  setv STUDIO_DEFAULT_ORGANIZATION "Santa Rosa"
  setv STUDIO_DEFAULT_PROJECT "Renew Subastas (pruebas)"
  setv DASHBOARD_USERNAME renew
  setv DASHBOARD_PASSWORD "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  echo "   configuración y secretos nuevos listos (.env 600)"
REMOTE

log "2/4 contenedores"
ssh "$HOST" "cd '$DST' && docker compose pull -q 2>/dev/null; docker compose up -d 2>&1 | tail -3"

log "3/4 esperando a la base y a la API"
ssh "$HOST" "DST='$DST' bash -s" <<'REMOTE'
  set -euo pipefail
  cd "$DST"
  ANON="$(sed -n 's/^ANON_KEY=//p' .env)"
  SRV="$(sed -n 's/^SERVICE_ROLE_KEY=//p' .env)"
  for i in $(seq 1 60); do
    db="$(docker inspect -f '{{.State.Health.Status}}' renew-supabase-db 2>/dev/null || echo '?')"
    auth="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" http://127.0.0.1:8110/auth/v1/health || true)"
    # The REST root (OpenAPI) is service_role-only in this version: anon gets
    # 403 there by design, so the readiness probe uses the service key.
    rest="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $SRV" -H "Authorization: Bearer $SRV" http://127.0.0.1:8110/rest/v1/ || true)"
    if [[ "$db" == healthy && "$auth" == 200 && "$rest" == 200 ]]; then break; fi
    sleep 5
  done
  echo "   base: $db · auth: $auth · rest (service): $rest"
  docker compose ps --format '{{.Name}} {{.Status}}' | sed 's/^/   /'
REMOTE

log "4/4 claves para esta máquina"
umask 077
mkdir -p "$(dirname "$LOCAL_KEYS")"
ssh "$HOST" "grep -E '^(ANON_KEY|SERVICE_ROLE_KEY|POSTGRES_PASSWORD|JWT_SECRET|DASHBOARD_USERNAME|DASHBOARD_PASSWORD)=' '$DST/.env'" > "$LOCAL_KEYS"
chmod 600 "$LOCAL_KEYS"
echo "   $(wc -l < "$LOCAL_KEYS") valores en $LOCAL_KEYS (600)"
