# RENEW SUBASTAS

Plataforma de subastas asincrónicas de vehículos.

## Setup

```bash
pnpm install
cp .env.example .env.local
# rellenar valores
pnpm dev
```

Ver `docs/superpowers/specs/` para el diseño y `docs/superpowers/plans/` para los planes.

## Bootstrap first admin (one-time)

Against staging:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  pnpm bootstrap-admin admin@santarosa.com.py "Nombre" "Apellido" "1234567"
```

Against the emulator (for local dev):

```bash
cd functions
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=carbid-staging \
  pnpm bootstrap-admin admin@santarosa.com.py "Test" "Admin" "1234567"
```
