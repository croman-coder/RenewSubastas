#!/usr/bin/env bash
# Corre Strix (agente de pentesting) contra el CÓDIGO local del repo, nunca
# contra producción. Encuentra bugs de auth, lógica, inyección y exposición de
# secretos leyendo y razonando sobre el código, dentro de un sandbox Docker.
#
# Requisitos:
#   - Docker corriendo (ya está).
#   - Strix instalado (ya está, vía `uv tool install strix-agent`).
#   - TU API key de un LLM. Strix es un agente de IA: corre en tu cuenta y
#     gasta plata. No está seteada en este entorno; la ponés vos abajo.
#
# Uso:
#   export STRIX_LLM="openai/gpt-5"          # o el modelo que uses
#   export LLM_API_KEY="sk-..."              # la key del proveedor de arriba
#   bash docs/seguridad/strix-local.sh
#
# El tope de presupuesto está puesto para que NO se te dispare el gasto: se
# corta solo al llegar. Subilo si querés un barrido más profundo.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

if [ -z "${STRIX_LLM:-}" ] || [ -z "${LLM_API_KEY:-}" ]; then
  echo "Falta configurar el LLM. Antes de correr esto:"
  echo "  export STRIX_LLM=\"openai/gpt-5\"   # el modelo que uses"
  echo "  export LLM_API_KEY=\"sk-...\"         # tu key del proveedor"
  exit 1
fi

# --target el directorio del repo: Strix lo monta de sólo-trabajo en su
# sandbox y razona sobre el código. Foco explícito en lo que más importa en
# esta app: reglas de Firestore/Storage, auth de los callables, y manejo de
# los tokens/comprobantes.
strix \
  --target "$REPO_DIR" \
  --scan-mode deep \
  --max-budget 15 \
  --instruction "App de subastas en Firebase (Firestore + Cloud Functions v2 callables) y Next.js. El límite de seguridad real son firestore.rules y storage.rules (el cliente escribe la base directo) y las guardas de rol en functions/src/**/*.ts. Enfocá: (1) IDOR y bypass de audiencia retail/mayorista, (2) escalada de privilegios vía claims o campos server-managed en el doc de usuario, (3) manipulación de precio/puja/estado de subasta desde el cliente, (4) fuga del comprobante de seña o de datos bancarios (app_config, reservePrice), (5) tokens de reset de contraseña. Es una app en producción: reportá, no expongas datos reales."

echo
echo "Reporte en: $REPO_DIR/strix_runs/  (abrí el último run)"
