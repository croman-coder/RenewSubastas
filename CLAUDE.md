# CARBID — Renew Subastas

Plataforma web de subastas de vehículos usados de Santa Rosa Paraguay S.A.
Producción: **https://renewsubastas.com.py**.

**Arquitectura completa y verificada: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).**
Leé su sección 0 antes de tocar nada.

## Stack real

Monorepo pnpm + Turborepo: `apps/web` (Next.js 14 App Router, Tailwind, next-intl es/en),
`functions` (Firebase Cloud Functions 2ª gen, Node 20), `packages/shared-types` (Zod),
`packages/firebase-client`, `apps/mirror` (espejo de Firestore a Postgres en SRPY186).
Firebase: Auth, Firestore, Storage, Functions, FCM, App Check. Correo con Resend. Sentry.

`infra/supabase-renew/` es una **copia de pruebas** de toda la base en un Supabase autoalojado en
SRPY186. **No es producción**. Tiene datos personales reales, así que no se publica en internet sin
Cloudflare Access (ver su README).

## Reglas que no se negocian

1. `carbid-staging` **es producción**. No hay staging. `firebase deploy --project carbid-staging`
   llega a usuarios reales al instante.
2. `git push origin main` publica la web (Netlify, ~2 min) y **cada push cuesta 15 créditos** del
   equipo de Netlify (el 26/9/2026 se agotaron los 3.000 del mes). Probar en local, juntar cambios
   y empujar a `main` solo cuando Croman decide publicar. Netlify construye solo `main`: otras
   ramas se pueden subir a GitHub gratis. Verificar lo publicado con el `published_deploy` de
   Netlify, no con git.
3. Functions, reglas e índices se despliegan aparte con el CLI de Firebase.
4. El Admin SDK se saltea reglas y política de contraseñas: repetir chequeos a mano.
5. Toda lógica que mueve plata o estados vive en Cloud Functions.
6. Pablo empuja a GitHub; el deploy a producción lo controla Croman.

## Comandos

```bash
pnpm install
pnpm emulators                 # Auth, Firestore, Functions, Storage
pnpm seed && pnpm seed:demo    # admin + datos de ejemplo en el emulador
pnpm dev:web                   # http://localhost:3100
pnpm --filter @carbid/web test
firebase emulators:exec --only auth,firestore,storage --project carbid-test 'pnpm --filter @carbid/functions test'
pnpm typecheck && pnpm lint
```

Con emuladores, correr las funciones con `ENFORCE_APP_CHECK=false`.

## Convenciones

- Comentarios nuevos en español; explicar el porqué, con fecha si nace de un incidente.
- Tests junto al código (`*.test.ts`); los de `functions` corren contra emuladores.
- Dependencias inyectables para testear sin red (patrón `fetchImpl`, `deps`).
- Montos y cantidades solo con `lib/format/money.ts` (`formatUsd`, `formatAmount`,
  `formatNumber`); fechas de tablas con `formatDateTimePy`. Nunca `toLocaleString()` sin idioma:
  el servidor corre en inglés y UTC, y el texto distinto rompe la hidratación.
- Diseño: `DESIGN.md` ("tinta y papel"), aplicado con los tokens de `globals.css`. Las clases
  `glass-*`, `ink-mesh` y `sheen` ya son sólidas: no volver a meter desenfoques ni brillos.
- `sendEmail()` nunca lanza: mirar `status`.
- Commits convencionales en español (`fix(push): …`, `docs: …`).

Agentes de proyecto instalados en `.claude/agents/` (engineering, design, testing, product).
