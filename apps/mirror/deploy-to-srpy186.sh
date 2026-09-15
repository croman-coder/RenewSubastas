#!/usr/bin/env bash
# Despliega (o actualiza) el espejo en SRPY186 desde esta máquina.
#
#   bash apps/mirror/deploy-to-srpy186.sh            # actualizar imagen + reiniciar
#   FIRST_RUN=1 SA_KEY=/ruta/renew-mirror-sa.json \
#   bash apps/mirror/deploy-to-srpy186.sh            # primera vez: también clave, DB, .env
#
# Qué hace:
#   1. construye la imagen desde la raíz del repo (Dockerfile del mirror)
#   2. la carga en el servidor por ssh (docker save | docker load)
#   3. sincroniza docker-compose.server.yml
#   4. FIRST_RUN: copia la clave de la SA (600), crea usuario + base en
#      srpy-postgres con una contraseña generada acá y escribe .env (600).
#      La contraseña no se imprime nunca.
#   5. docker compose up -d, espera /healthz, corre `verify`
#
# Idempotente: correrlo de nuevo sólo reemplaza la imagen y reinicia.
set -euo pipefail

HOST="${HOST:-srpy-servidor}"
REMOTE_DIR="${REMOTE_DIR:-/home/santarosa/stack/renew-mirror}"
IMAGE="renew-mirror:latest"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

log "1/5 construyendo imagen"
docker build -q -f "$REPO_ROOT/apps/mirror/Dockerfile" -t "$IMAGE" "$REPO_ROOT" >/dev/null
docker image inspect "$IMAGE" --format '   {{.Id}}' | cut -c1-24

log "2/5 cargando imagen en $HOST"
docker save "$IMAGE" | gzip | ssh "$HOST" 'gunzip | docker load' | tail -1

log "3/5 sincronizando compose"
ssh "$HOST" "mkdir -p '$REMOTE_DIR/secrets' '$REMOTE_DIR/storage' && chmod 700 '$REMOTE_DIR/secrets'"
scp -q "$REPO_ROOT/apps/mirror/docker-compose.server.yml" "$HOST:$REMOTE_DIR/docker-compose.yml"

if [[ "${FIRST_RUN:-0}" == "1" ]]; then
  log "4/5 primera vez: clave, base, .env"
  : "${SA_KEY:?FIRST_RUN=1 requiere SA_KEY=/ruta/a/renew-mirror-sa.json}"
  # La clave tiene que ser la de sólo lectura, no la del Admin SDK.
  if grep -q '"client_email": *"firebase-adminsdk' "$SA_KEY"; then
    echo "ERROR: $SA_KEY es la clave del Admin SDK (escritura). Usá la de renew-mirror@." >&2
    exit 1
  fi
  scp -q "$SA_KEY" "$HOST:$REMOTE_DIR/secrets/renew-mirror-sa.json"
  ssh "$HOST" "chmod 600 '$REMOTE_DIR/secrets/renew-mirror-sa.json'"

  # Contraseña generada acá, enviada por el canal ssh, nunca por stdout.
  PW="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
  ssh "$HOST" "PW='$PW' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
    set -euo pipefail
    PGU="$(docker exec srpy-postgres printenv POSTGRES_USER)"
    exists_user=$(docker exec srpy-postgres psql -U "$PGU" -d postgres -tAc "select 1 from pg_roles where rolname='renew_mirror'")
    if [[ "$exists_user" != "1" ]]; then
      docker exec srpy-postgres psql -U "$PGU" -d postgres -c "create user renew_mirror password '$PW'" >/dev/null
      echo "   usuario renew_mirror creado"
    else
      docker exec srpy-postgres psql -U "$PGU" -d postgres -c "alter user renew_mirror password '$PW'" >/dev/null
      echo "   usuario renew_mirror ya existía: contraseña rotada"
    fi
    exists_db=$(docker exec srpy-postgres psql -U "$PGU" -d postgres -tAc "select 1 from pg_database where datname='renewsubastas_mirror'")
    if [[ "$exists_db" != "1" ]]; then
      docker exec srpy-postgres psql -U "$PGU" -d postgres -c "create database renewsubastas_mirror owner renew_mirror" >/dev/null
      echo "   base renewsubastas_mirror creada"
    else
      echo "   base renewsubastas_mirror ya existía"
    fi
    umask 077
    printf 'MIRROR_DATABASE_URL=postgres://renew_mirror:%s@srpy-postgres:5432/renewsubastas_mirror\n' "$PW" > "$REMOTE_DIR/.env"
    chmod 600 "$REMOTE_DIR/.env"
    echo "   .env escrito (600)"
REMOTE
  unset PW
else
  log "4/5 (no es primera vez: clave, base y .env se conservan)"
fi

log "5/5 levantando"
ssh "$HOST" "cd '$REMOTE_DIR' && docker compose up -d --remove-orphans 2>&1 | tail -2"
echo -n "   esperando /healthz "
for _ in $(seq 1 60); do
  if ssh "$HOST" 'curl -sf -m 3 http://127.0.0.1:8787/healthz >/dev/null'; then
    echo "✓"
    break
  fi
  echo -n "."
  sleep 5
done
ssh "$HOST" 'curl -s -m 5 http://127.0.0.1:8787/healthz' | node -e '
  let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{ try { const j=JSON.parse(d);
    console.log(`   healthy=${j.healthy} listeners=${j.tail?.listeners} docs=${j.docs} auth=${j.authUsers} storage=${j.storageObjects}`);
    if (j.lastError) console.log("   lastError:", j.lastError);
  } catch { console.log("   (sin respuesta JSON de /healthz todavía)"); } })'

log "verify (Firestore vs espejo)"
ssh "$HOST" 'docker exec renew-mirror node dist/cli.js verify 2>/dev/null | tail -22' || true
