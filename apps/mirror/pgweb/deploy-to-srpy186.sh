#!/usr/bin/env bash
# Levanta (o actualiza) el visor web del espejo en SRPY186 y lo cuelga del
# túnel de Cloudflare como https://espejo-subastas.santarosa.lat
#
# Hasta el 2026-09-26 vivía en subastas.santarosa.lat; ese nombre quedó para
# la copia de la app en servidor propio (docs/superpowers/specs/
# 2026-09-26-servidor-propio-design.md). Si el túnel todavía tiene la regla
# vieja, el paso 4 la renombra en vez de agregar una segunda.
#
#   bash apps/mirror/pgweb/deploy-to-srpy186.sh
#
# Qué hace, en orden:
#   1. rol renew_mirror_ro en srpy-postgres (SELECT y nada más, también sobre
#      tablas futuras del espejo) — idempotente, rota la contraseña si existe
#   2. .env de pgweb en el servidor (600): URL con ese rol + basic auth
#      temporal; la contraseña de basic auth queda en ~/keys/subastas-pgweb.txt
#      (600) en ESTA máquina, nunca en pantalla
#   3. docker compose up -d del contenedor renew-pgweb (redes coolify +
#      srpy-infra_default, sin puertos en el host)
#   4. regla de ingress en /home/santarosa/cloudflared-compras/config.yml
#      (backup con fecha, misma convención que las demás) y reinicio de las
#      dos réplicas del túnel
#   5. DNS: cloudflared tunnel route dns (cert.pem de esta notebook)
#   6. prueba: la URL tiene que pedir basic auth (401) — o sea, llega a pgweb
#      y no deja pasar a nadie sin clave — mientras Access no la cubra
set -euo pipefail

HOST="${HOST:-srpy-servidor}"
REMOTE_DIR="${REMOTE_DIR:-/home/santarosa/stack/renew-mirror/pgweb}"
TUNNEL_ID="505fc6ac-4f83-4fbe-b490-9110828589ea"
HOSTNAME_PUB="espejo-subastas.santarosa.lat"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LOCAL_SECRET="$HOME/keys/subastas-pgweb.txt"

log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

log "1/6 rol de sólo lectura + 2/6 .env de pgweb"
RO_PW="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
if [[ -f "$LOCAL_SECRET" ]]; then
  BA_PW="$(sed -n 's/^password=//p' "$LOCAL_SECRET")"
  sed -i "s#^url=.*#url=https://$HOSTNAME_PUB#" "$LOCAL_SECRET"
  echo "   basic auth: reutilizo la clave de $LOCAL_SECRET"
else
  BA_PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  umask 077
  printf 'url=https://%s\nuser=renew\npassword=%s\n' "$HOSTNAME_PUB" "$BA_PW" > "$LOCAL_SECRET"
  chmod 600 "$LOCAL_SECRET"
  echo "   basic auth: clave nueva guardada en $LOCAL_SECRET (600)"
fi
ssh "$HOST" "RO_PW='$RO_PW' BA_PW='$BA_PW' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
  set -euo pipefail
  PGU="$(docker exec srpy-postgres printenv POSTGRES_USER)"
  # Sin -i y con stdin en /dev/null: este script llega por stdin (ssh bash -s),
  # y un `docker exec -i` se traga el resto del script. Pasó en la primera corrida.
  psql_pg() { docker exec srpy-postgres psql -U "$PGU" -d postgres -v ON_ERROR_STOP=1 -qAt "$@" </dev/null; }
  psql_db() { docker exec srpy-postgres psql -U "$PGU" -d renewsubastas_mirror -v ON_ERROR_STOP=1 -qAt "$@" </dev/null; }
  if [[ "$(psql_pg -c "select 1 from pg_roles where rolname='renew_mirror_ro'")" == "1" ]]; then
    psql_pg -c "alter role renew_mirror_ro password '$RO_PW'"
    echo "   rol renew_mirror_ro: contraseña rotada"
  else
    psql_pg -c "create role renew_mirror_ro login password '$RO_PW'"
    echo "   rol renew_mirror_ro creado"
  fi
  psql_pg -c "grant connect on database renewsubastas_mirror to renew_mirror_ro"
  psql_db -c "grant usage on schema public to renew_mirror_ro; grant select on all tables in schema public to renew_mirror_ro; alter default privileges for role renew_mirror in schema public grant select on tables to renew_mirror_ro; revoke create on schema public from renew_mirror_ro;"
  echo "   permisos: SELECT sobre todo lo actual y lo futuro del espejo, nada más"
  mkdir -p "$REMOTE_DIR"
  umask 077
  cat > "$REMOTE_DIR/.env" <<ENV
PGWEB_DATABASE_URL=postgres://renew_mirror_ro:${RO_PW}@srpy-postgres:5432/renewsubastas_mirror?sslmode=disable
PGWEB_AUTH_USER=renew
PGWEB_AUTH_PASS=${BA_PW}
ENV
  chmod 600 "$REMOTE_DIR/.env"
  echo "   .env escrito (600)"
REMOTE
unset RO_PW BA_PW

log "3/6 contenedor renew-pgweb"
scp -q "$REPO_ROOT/apps/mirror/pgweb/docker-compose.yml" "$HOST:$REMOTE_DIR/docker-compose.yml"
ssh "$HOST" "cd '$REMOTE_DIR' && docker compose pull -q && docker compose up -d --remove-orphans 2>&1 | tail -1"
# Prueba interna: desde la red del túnel, sin clave → 401; con clave → 200.
ssh "$HOST" 'docker run --rm --network coolify curlimages/curl:8.10.1 -s -o /dev/null -w "   interno sin clave: %{http_code}\n" http://renew-pgweb:8081/'

log "4/6 ingress del túnel"
ssh "$HOST" "HOSTNAME_PUB='$HOSTNAME_PUB' bash -s" <<'REMOTE'
  set -euo pipefail
  CFG=/home/santarosa/cloudflared-compras/config.yml
  if grep -q "hostname: $HOSTNAME_PUB" "$CFG"; then
    echo "   ya estaba en el ingress"
  else
    cp "$CFG" "$CFG.bak-antes-espejo-subastas-$(date +%Y%m%d-%H%M%S)"
    python3 - "$CFG" "$HOSTNAME_PUB" <<'PY'
import re, sys
p, host = sys.argv[1], sys.argv[2]
s = open(p).read()
svc = "  service: http://renew-pgweb:8081\n"
# Una regla existente de pgweb con otro nombre (la vieja de subastas.santarosa.lat)
# se renombra: dos nombres apuntando al visor dejarían abierto el viejo.
old = re.search(r"- hostname: ([^\n]+)\n" + re.escape(svc), s)
if old:
    s = s.replace(old.group(0), f"- hostname: {host}\n{svc}")
    print(f"   regla movida de {old.group(1)} a {host}")
else:
    marker = "- service: http_status:404"
    assert marker in s, "no encuentro la regla catch-all"
    s = s.replace(marker, f"- hostname: {host}\n{svc}" + marker)
    print("   regla agregada antes del catch-all")
open(p, "w").write(s)
PY
    for c in cloudflared-compras cloudflared-replica2; do
      docker restart "$c" >/dev/null
      sleep 6
      echo "   $c: $(docker logs --tail 5 "$c" 2>&1 | grep -ciE 'registered|connection' ) conexiones registradas"
    done
  fi
REMOTE

log "5/6 DNS"
if cloudflared tunnel route dns "$TUNNEL_ID" "$HOSTNAME_PUB" 2>&1 | tail -1; then :; fi

log "6/6 prueba desde afuera"
echo -n "   esperando propagación "
code=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOSTNAME_PUB/" || true)"
  case "$code" in 401|302|200) break;; esac
  echo -n "."
  sleep 5
done
echo
case "$code" in
  401) echo "   https://$HOSTNAME_PUB → 401: llega a pgweb y exige la clave de basic auth. Correcto mientras Access no lo cubra." ;;
  302) echo "   https://$HOSTNAME_PUB → 302: Cloudflare Access ya lo cubre (manda al login de Access)." ;;
  200) echo "   ATENCIÓN: https://$HOSTNAME_PUB → 200 sin clave. Basic auth no está activo. Revisar PGWEB_AUTH_* antes de seguir." ;;
  *)   echo "   https://$HOSTNAME_PUB → '$code' (todavía sin propagar o bloqueado). Reintentar en un minuto: curl -sI https://$HOSTNAME_PUB" ;;
esac
