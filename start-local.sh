#!/usr/bin/env bash
# Arranca CARBID en local: emuladores Firebase + frontend Next.js.
# Uso:  ./start-local.sh
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"   # Java para los emuladores
export JAVA_HOME="/opt/homebrew/opt/openjdk"

IMPORT_FLAG=""
[ -d .emulator-data ] && IMPORT_FLAG="--import=./.emulator-data"

echo "▶ Levantando emuladores Firebase..."
firebase emulators:start --only auth,firestore,functions,storage \
  $IMPORT_FLAG --export-on-exit=./.emulator-data --project carbid-staging &
EMU_PID=$!
trap "echo '⏹ Parando...'; kill $EMU_PID 2>/dev/null" EXIT INT TERM

echo "▶ Esperando emuladores..."
until curl -s http://127.0.0.1:4400/ >/dev/null 2>&1; do sleep 1; done

# Sembrar admin + demo solo si no hay datos persistidos previos
if [ -z "$IMPORT_FLAG" ]; then
  echo "▶ Sembrando admin + datos demo..."
  pnpm seed && pnpm seed:demo || true
fi

echo "▶ Iniciando web en http://localhost:3100 ..."
pnpm dev:web
