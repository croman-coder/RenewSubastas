# CARBID — MVP Design Spec

**Fecha**: 2026-05-05
**Estado**: aprobado tras brainstorming
**Autor(es)**: usuario + Claude (brainstorming)
**Próximo paso**: `writing-plans` skill para producir el plan de implementación

---

## 1. Resumen ejecutivo

CARBID es una plataforma web de **subastas asincrónicas de vehículos** (formato eBay Motors) para el mercado paraguayo, con tres roles diferenciados (admin, staff, comprador) y un MVP centrado en autenticación, catálogo y pujas básicas. El backend completo se apoya en Firebase (Auth + Firestore + Storage + Cloud Functions) y el frontend es una aplicación Next.js 14 desplegada en Netlify. El diseño deja preparada la migración futura a apps móviles nativas (iOS + Android) con React Native reutilizando la capa Firebase.

## 2. Objetivos del MVP

- Permitir al **admin** crear cuentas para staff y compradores (no hay self-signup).
- Permitir al **staff** cargar vehículos con fotos y crear subastas.
- Permitir al **comprador** ver el catálogo, pujar en tiempo real con anti-sniping y consultar sus pujas y vehículos ganados.
- Entregar dashboards profesionales por rol con configuración completa (perfil, seguridad, preferencias, eliminación de cuenta).
- Soporte i18n con español por defecto e inglés disponible por usuario.
- Quedar listo para añadir apps móviles RN reutilizando el backend.

### Fuera de alcance (MVP)

- Pasarela de pago real / cobros in-app (sí incluye **calculadora de cuotas** visible al comprador, no procesa el pago).
- Notificaciones push y SMS.
- Proxy bidding (puja máxima automática).
- App móvil nativa iOS/Android.
- 2FA (UI preparada, lógica post-MVP).

## 3. Stack y arquitectura

### Stack

- **Frontend web**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + react-hook-form + zod + TanStack Query + sonner + lucide-react + recharts
- **i18n**: next-intl (`es` default, `en` alternativo, persistido en `users/{uid}.preferences.locale`)
- **Backend**: Firebase Cloud Functions (TypeScript) + firebase-admin
- **DB**: Firestore (modo Native)
- **Auth**: Firebase Auth + custom claims (`role`, `status`)
- **Storage**: Firebase Storage (fotos de vehículos, avatares)
- **Hosting web**: Netlify (`@netlify/plugin-nextjs`)
- **Hosting backend**: Firebase (Functions, Firestore, Storage)
- **Tests**: Vitest, Playwright, `@firebase/rules-unit-testing`, Firebase Local Emulator
- **CI/CD**: GitHub Actions
- **Observabilidad**: Cloud Logging + Cloud Monitoring + Sentry + Firebase Performance

### Estructura de monorepo (Turborepo)

```
CARBID/
├── apps/
│   └── web/                       Next.js 14 (App Router)
│       ├── app/
│       │   └── [locale]/
│       │       ├── (auth)/login
│       │       ├── (admin)/admin/{users,vehicles,auctions,audit}
│       │       ├── (staff)/staff/{vehicles,auctions}
│       │       ├── (buyer)/{auctions,bids,won,favorites}
│       │       └── (shared)/settings/{profile,security,preferences,danger-zone}
│       ├── messages/{es.json,en.json}
│       └── middleware.ts          Guards por rol (custom claims)
├── functions/                     Cloud Functions
│   └── src/
│       ├── auth/{createUser,updateUserRole,deleteUser,onUserSync}.ts
│       ├── auctions/{createAuction,placeBid,closeAuction,cancelAuction}.ts
│       ├── users/{cleanupDeletedAccounts}.ts
│       └── storage/{onImageUpload}.ts
├── packages/
│   ├── shared-types/              Vehicle, User, Auction, Bid, validadores Paraguay (CI/RUC)
│   └── firebase-client/           initApp + hooks reutilizables (web ahora, RN después)
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── .env.local                     gitignored
├── netlify.toml
└── turbo.json
```

### Ambientes Firebase

- `carbid-staging` — a crear, para PRs y staging
- `carbid-59ef5` — producción (existente)

## 4. Modelo de datos (Firestore)

### `users/{uid}`

```ts
{
  uid: string,
  role: "admin" | "staff" | "buyer",
  email: string,
  status: "active" | "disabled",
  profile: {
    firstName: string,
    lastName: string,
    documentType: "CI" | "RUC",         // CI Paraguay o RUC Paraguay
    documentNumber: string,
    phone?: string,
    address?: { street, city, country: "PY", postalCode? },
    avatarUrl?: string
  },
  preferences: {
    locale: "es" | "en",
    theme: "light" | "dark" | "system",
    notifications: {
      outbidEmail: boolean,
      auctionWonEmail: boolean,
      newAuctionEmail: boolean
    }
  },
  createdBy: string,                   // uid del admin que creó la cuenta
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastLoginAt?: Timestamp,
  deletedAt?: Timestamp                // soft delete
}
```

### `vehicles/{vehicleId}`

```ts
{
  id: string,
  vin?: string,
  make: string,
  model: string,
  year: number,
  mileage?: number,
  transmission: "manual" | "automatic" | "cvt",
  fuelType: "gasoline" | "diesel" | "hybrid" | "electric",
  color?: string,
  description: { es: string, en?: string },
  images: [{ url, thumbnailUrl, order }],
  condition: "new" | "used" | "damaged",
  createdBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  status: "draft" | "ready" | "in_auction" | "sold" | "archived"
}
```

### `auctions/{auctionId}`

```ts
{
  id: string,
  vehicleId: string,
  vehicleSnapshot: { make, model, year, thumbnailUrl },
  startingPrice: number,
  reservePrice?: number,
  bidIncrement: number,
  startsAt: Timestamp,
  endsAt: Timestamp,                   // se actualiza por anti-sniping
  currentBid: number,
  currentBidderUid?: string,
  bidCount: number,
  status: "scheduled" | "live" | "ended" | "cancelled",
  outcome?: "sold" | "reserve_not_met" | "no_bids",
  winnerUid?: string,
  finalPrice?: number,
  createdBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `auctions/{auctionId}/bids/{bidId}` (subcolección)

```ts
{
  id: string,
  auctionId: string,
  buyerUid: string,
  buyerSnapshot: { firstName, lastInitial },
  amount: number,
  createdAt: Timestamp,
  ipAddress?: string,
  status: "valid" | "outbid" | "winning" | "rejected"
}
```

### `audit_logs/{logId}` (admin only)

```ts
{
  actorUid, action, resourceType, resourceId,
  before?: object, after?: object,
  ipAddress, userAgent, createdAt
}
```

### `app_config/global` (singleton, solo admin escribe)

```ts
{
  currency: {
    primary: "USD" | "PYG",                // moneda por defecto del display
    showSecondary: boolean,                 // mostrar conversión a la otra moneda
    pygPerUsd?: number,                     // tipo de cambio (manual por ahora)
    pygPerUsdUpdatedAt?: Timestamp
  },
  bid: {
    fixedIncrementUsd: number,              // default 500
    allowManualIncrement: boolean,          // default true; respeta >= incremento mínimo
    antiSnipingSeconds: number              // default 60
  },
  financing: {
    enabled: boolean,
    allowedTerms: number[],                 // ej: [12, 24, 36, 48, 60] meses
    annualInterestRate: number,             // ej: 0.18 = 18% anual
    downPaymentPercent: number,             // ej: 0.20 = 20% inicial
    minFinanceableUsd: number,              // monto mínimo para ofrecer cuotas
    notes?: { es: string, en?: string }     // texto legal o informativo
  },
  emails: {
    adminStaffDomain: string,               // "santarosa.com.py" — validado al crear admin/staff
    fromAddress: string,                    // "no-reply@santarosa.com.py"
    fromName: string                        // "CARBID Subastas"
  },
  updatedBy: string,
  updatedAt: Timestamp
}
```

### Decisiones de modelado

- **Pujas como subcolección**, no array: permite reglas finas, paginación, escalabilidad y un único listener por subasta.
- **Snapshots denormalizados** (`vehicleSnapshot`, `buyerSnapshot`) para listas sin joins.
- **Custom claims** (`role`, `status`) sincronizados desde Cloud Functions; son la fuente de verdad para Security Rules.
- **Soft delete** en users (`deletedAt` + `status: disabled`); cron diario hace hard delete a los 30 días.
- **Anti-sniping**: la Cloud Function `placeBid` extiende `endsAt` 60s si una puja llega en los últimos 60s.

### Índices compuestos requeridos

- `auctions (status asc, endsAt asc)` — listar por estado ordenado por cierre
- `auctions (status asc, startsAt asc)` — programadas
- `bids (auctionId asc, amount desc)` — historial por subasta
- `users (role asc, status asc, createdAt desc)` — admin filter
- `vehicles (status asc, createdBy asc, updatedAt desc)` — mis vehículos staff

### Validación de dominios de email

- **Admin y Staff**: el email debe pertenecer a `app_config/global.emails.adminStaffDomain` (default `santarosa.com.py`). Validado en la Cloud Function `auth.createUser`.
- **Buyer**: cualquier dominio válido (los crea el admin a partir del email del cliente).

## 5. Seguridad

### Principios

1. **Custom claims** = fuente de verdad para autorización en reglas.
2. **Cloud Functions** ejecutan los writes críticos (`placeBid`, creación/borrado de usuarios, cambio de roles, cierre de subasta). El cliente no escribe directo en `auctions` ni en `bids`.
3. **Cliente** solo escribe su propio perfil/preferencias y lee según rol.

### Firestore rules (esencia)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isSignedIn() { return request.auth != null; }
    function isActive()   { return request.auth.token.status == "active"; }
    function role()       { return request.auth.token.role; }
    function isAdmin()    { return isSignedIn() && isActive() && role() == "admin"; }
    function isStaff()    { return isSignedIn() && isActive() && role() == "staff"; }
    function isBuyer()    { return isSignedIn() && isActive() && role() == "buyer"; }

    match /users/{uid} {
      allow read:   if isAdmin() || request.auth.uid == uid;
      allow update: if request.auth.uid == uid
                    && request.resource.data.role == resource.data.role
                    && request.resource.data.status == resource.data.status
                    && request.resource.data.createdBy == resource.data.createdBy;
      allow create, delete: if false;     // solo via Cloud Function
    }

    match /vehicles/{id} {
      allow read:           if isSignedIn() && isActive();
      allow create, update: if isStaff() || isAdmin();
      allow delete:         if isAdmin();
    }

    match /auctions/{id} {
      allow read:                  if isSignedIn() && isActive();
      allow create, update, delete: if false;     // solo via Cloud Function

      match /bids/{bidId} {
        allow read:                  if isSignedIn() && isActive();
        allow create, update, delete: if false;   // solo via placeBid
      }
    }

    match /audit_logs/{id} {
      allow read:  if isAdmin();
      allow write: if false;
    }
  }
}
```

### Storage rules

```js
service firebase.storage {
  match /b/{bucket}/o {
    match /vehicles/{vehicleId}/{file=**} {
      allow read:  if request.auth != null && request.auth.token.status == "active";
      allow write: if request.auth.token.role in ["staff", "admin"]
                   && request.resource.size < 10 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
    match /avatars/{uid}/{file=**} {
      allow read:  if true;
      allow write: if request.auth.uid == uid
                   && request.resource.size < 2 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### Cloud Functions

| Function                          | Trigger                       | Descripción                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.createUser`                 | callable (admin)              | Crea Auth user + doc `users/` + custom claims. Valida CI/RUC PY. Email de bienvenida con link de seteo de contraseña.                                                                                                        |
| `auth.updateUserRole`             | callable (admin)              | Cambia rol y custom claims. Audit log.                                                                                                                                                                                       |
| `auth.deleteUser`                 | callable (admin o self-buyer) | Soft delete + schedule hard delete 30d. Invalida sesiones.                                                                                                                                                                   |
| `auctions.createAuction`          | callable (staff/admin)        | Valida vehículo `ready`, fechas y precios. Crea subasta.                                                                                                                                                                     |
| `auctions.placeBid`               | callable (buyer)              | Transaction Firestore: lee subasta → valida (`live`, monto > current+increment, no self-outbid) → escribe bid + actualiza `currentBid` + anti-sniping (extiende `endsAt` 60s si quedan <60s). Rate limit 10 pujas/min/buyer. |
| `auctions.closeAuction`           | scheduled (cada 1 min)        | Cierra subastas `live` con `endsAt < now`. Asigna `winnerUid` y `outcome`. Notifica por email.                                                                                                                               |
| `auctions.cancelAuction`          | callable (admin)              | Cancela subasta activa con motivo. Audit log.                                                                                                                                                                                |
| `users.cleanupDeletedAccounts`    | scheduled (diario)            | Hard delete de usuarios con `deletedAt > 30d`.                                                                                                                                                                               |
| `storage.onImageUpload`           | trigger Storage               | Genera thumbnail (sharp). Actualiza `vehicles/{id}.images`.                                                                                                                                                                  |
| `auth.onUserSync`                 | trigger Auth/Firestore        | Sincroniza custom claims con `role` y `status`.                                                                                                                                                                              |
| `config.updateGlobalConfig`       | callable (admin)              | Actualiza `app_config/global` (moneda, incrementos, financiación, dominio emails, tipo de cambio). Audit log.                                                                                                                |
| `financing.calculateInstallments` | callable (buyer)              | Pure function: dado `priceUsd` y `term`, devuelve cuota mensual usando los parámetros vigentes en `app_config/global.financing`.                                                                                             |

### App Check y operacional

- App Check con reCAPTCHA v3 en producción.
- API key restringida en GCP (HTTP referrer = dominio Netlify).
- Rate limiting en `placeBid` (token bucket en Firestore para MVP).
- Secrets vía `firebase functions:secrets:set`; `.env*` en `.gitignore`.
- CSP estricto en headers de Netlify.
- Backups Firestore diarios a GCS, retención 30 días.

## 6. Features y dashboards por rol

### Layout común

- Topbar (logo, selector idioma, avatar/menú)
- Sidebar colapsable según rol
- Tema light/dark/system con toggle persistido
- Breadcrumbs en internas
- Toasts (sonner), skeletons, empty states con CTA

### Admin (`/admin/*`)

- **Home**: KPIs (usuarios activos por rol, subastas en curso, GMV, pujas hoy), gráficos (subastas por estado, pujas por día), subastas que cierran pronto, últimas acciones de audit log.
- **Users**: tabla con filtros (rol, estado, búsqueda); acciones (ver, editar, cambiar rol, activar/desactivar, eliminar); botón crear con form completo (valida dominio `santarosa.com.py` para admin/staff); detalle con tabs perfil/actividad/audit.
- **Vehicles**: todos los vehículos con filtros y acciones (ver, archivar, eliminar).
- **Auctions**: tabs programadas/en curso/finalizadas/canceladas; cancelar con motivo; ver historial de pujas.
- **Audit**: tabla paginada con filtros y diff before/after.
- **Configuración global** (`/admin/config`): edita `app_config/global`. Subsecciones:
  - **Moneda**: switch USD ↔ PYG como display primario; toggle "mostrar conversión secundaria"; campo "tipo de cambio PYG/USD" con `updatedAt`. Cambios aplican inmediatamente al próximo render de toda la app.
  - **Pujas**: incremento fijo (default $500); toggle "permitir incremento manual"; segundos de anti-sniping (default 60).
  - **Financiación / Cuotero**: toggle habilitar; chips multi-select de plazos permitidos (12, 24, 36, 48, 60); tasa anual %; entrada % (down payment); monto mínimo financiable; notas legales (es/en).
  - **Emails**: dominio admin/staff (default `santarosa.com.py`); from address y from name.

### Staff (`/staff/*`)

- **Home**: KPIs (vehículos creados, subastas activas, total vendido); borradores pendientes y subastas próximas a cerrar.
- **Vehicles**: lista filtrada por `createdBy`; wizard de creación de 3 pasos (datos, fotos, descripción es/en); estados draft → ready → in_auction → sold; acción "publicar a subasta".
- **Auctions**: crear subasta con form modal; tabs por estado; vista detalle con stream de pujas en tiempo real.

### Buyer (`/auctions/*`, `/buyer/*`)

- **Catálogo**: hero con búsqueda, filtros laterales (marca, año, km, transmisión, combustible, precio); grid de cards con countdown en vivo; tabs todas/cerrando pronto/recién listadas/favoritos.
- **Detalle de subasta**: carrusel de fotos con lightbox; specs; panel de puja sticky con countdown grande, opciones rápidas de incremento fijo (`+$500`, `+$1000`) y campo de monto manual (si admin lo habilita), botón "Pujar"; lista de pujas en tiempo real anonimizada; favorito; toast cuando alguien supera; **calculadora de cuotas** (selector de plazo entre los `allowedTerms` configurados por admin, muestra cuota mensual, total e intereses con etiqueta "simulación sujeta a aprobación").
- **Mis pujas**: tabs activas-ganando, activas-superado, ganadas, perdidas.
- **Vehículos ganados**: lista con datos de contacto del staff/admin para coordinación.
- **Favoritos**: lista guardada.

### Settings (`/settings/*`, común a todos los roles)

| Sección         | Contenido                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfil          | Avatar (upload), nombre, apellido, tipo doc (CI/RUC PY), número doc validado, teléfono, dirección. Escribe a `users/{uid}.profile`.            |
| Seguridad       | Cambiar contraseña (re-auth + nueva); sesiones activas con "cerrar en todos los dispositivos"; UI de 2FA preparada (post-MVP).                 |
| Preferencias    | Idioma (es/en), tema, notificaciones por email (toggles). Persiste en `users/{uid}.preferences` y refresca UI sin reload.                      |
| Zona de peligro | Solo `buyer`: eliminar cuenta con confirmación de texto + razón opcional → soft delete + hard delete 30d. Staff/admin: contactar a otro admin. |

### Identidad visual y paleta

**Estrategia**: _Committed_ en superficies de marca (login, landing, hero), _Restrained_ en producto interno (dashboards, formularios). Theme por defecto `light`; dark disponible. Anti-reflexes evitados: no "auction red", no automotive navy/silver, no colores bandera Paraguay, no neon-on-black, no SaaS-teal.

**Tokens de color (OKLCH, sin `#000` ni `#fff`)**:

| Token           | Light                  | Dark                   | Uso                                        |
| --------------- | ---------------------- | ---------------------- | ------------------------------------------ |
| `--bg-base`     | `oklch(98% 0.005 290)` | `oklch(18% 0.01 290)`  | fondo principal                            |
| `--bg-elev`     | `oklch(96% 0.005 290)` | `oklch(22% 0.01 290)`  | cards, sidebars                            |
| `--bg-deep`     | `oklch(94% 0.005 290)` | `oklch(26% 0.01 290)`  | superficies anidadas                       |
| `--text-strong` | `oklch(20% 0.01 290)`  | `oklch(96% 0.005 290)` | títulos, body                              |
| `--text-muted`  | `oklch(48% 0.01 290)`  | `oklch(72% 0.01 290)`  | secundario                                 |
| `--text-subtle` | `oklch(64% 0.01 290)`  | `oklch(58% 0.01 290)`  | captions                                   |
| `--ink`         | `oklch(28% 0.04 290)`  | `oklch(96% 0.005 290)` | logo "BID", botones primarios "Pujar"      |
| `--copper`      | `oklch(68% 0.13 55)`   | `oklch(75% 0.13 55)`   | logo "CAR", badges live, countdown urgente |
| `--success`     | `oklch(60% 0.13 155)`  | `oklch(70% 0.13 155)`  | "ganando", confirmaciones                  |
| `--warning`     | `oklch(70% 0.14 75)`   | `oklch(78% 0.14 75)`   | "te superaron"                             |
| `--danger`      | `oklch(55% 0.18 25)`   | `oklch(65% 0.18 25)`   | errores, eliminar cuenta                   |

**Logo CARBID**: wordmark sin icono separado. "CAR" en `--copper`, "BID" en `--ink` (en dark mode "BID" se vuelve casi blanco). Tipografía wordmark: **Bricolage Grotesque** Bold (open-source, geométrica con personalidad).

**Tipografía**:

- Wordmark: Bricolage Grotesque Bold
- UI body: **Inter Variable** (400/500/600/700)
- Numerales: tabulares para precios, countdowns, contadores de pujas
- Escala con ratio ≥1.25; body 16px, line-height 1.55, line-length 65–75ch

**Justificación**: copper + ink evoca provenance / casa de subastas (martillo de bronce, registro notarial) sin copiar a Sotheby's; cálido sin cliché automotor; autoritario sin SaaS-cream; alto contraste entre ambos colores del logo y contra los dos themes.

## 7. Internacionalización y moneda

- next-intl con namespaces: `common`, `auth`, `auctions`, `vehicles`, `users`, `settings`, `errors`.
- Detección de idioma: preferencia user → cookie → header `Accept-Language` → default `es`.
- Cambio en `/settings/preferences` actualiza Firestore y refresca UI sin reload.
- **Moneda primaria configurable por admin** en `app_config/global.currency.primary` (USD por defecto, PYG opcional). Formatos locales con `Intl.NumberFormat` y `Intl.DateTimeFormat`.
- Si `showSecondary = true`, los precios se muestran en la otra moneda al lado, usando `pygPerUsd`.
- **Operación interna en USD**: subastas, pujas, cuotas se almacenan en USD. PYG es solo para display. El admin actualiza `pygPerUsd` manualmente desde `/admin/config`.

## 8. Testing

| Capa                   | Herramienta                      | Cobertura                                                                              |
| ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Unit (web + functions) | Vitest                           | Validadores Paraguay (CI/RUC), helpers de pujas, formateo i18n                         |
| Functions integration  | Firebase Local Emulator + Vitest | `placeBid` (transactions, anti-sniping, race conditions), `createUser`, `closeAuction` |
| Security rules         | `@firebase/rules-unit-testing`   | Cada rol accede solo a lo permitido; tests positivos y negativos por colección         |
| E2E                    | Playwright contra emulators      | Login, admin crea buyer, staff crea subasta, buyer puja, ganador al cerrar             |
| Component              | Vitest + Testing Library         | Forms (perfil, vehículo), panel de puja, settings                                      |
| Visual regression      | (post-MVP)                       | Snapshots de UI                                                                        |

**Política**: TDD para Cloud Functions y validadores; coverage mínimo 70% en `functions/` y `packages/shared-types/`.

## 9. CI/CD y despliegue

GitHub Actions:

1. **`pr.yml`** — lint → typecheck → test → build → e2e contra emulators.
2. **`deploy-preview.yml`** — Netlify deploy preview + Firebase preview channel + deploy a `carbid-staging`.
3. **`deploy-prod.yml`** — Netlify producción + `firebase deploy --only functions,firestore:rules,firestore:indexes,storage:rules` en `carbid-59ef5`. Notificación al cierre.

Variables `.env.local` (dev), `.env.staging`, `.env.production`. Secrets en Netlify + GitHub Actions; secrets de Functions con `firebase functions:secrets:set`.

## 10. Observabilidad

- **Cloud Logging + Cloud Monitoring** (Functions).
- **Sentry** en Next.js + Functions.
- **Firebase Performance Monitoring** en web (TTFB, LCP, custom traces de `placeBid`).
- **Dashboard custom** con SLOs:
  - p95 `placeBid` < 500ms
  - tasa de error de Functions < 1%
  - éxito de cron `closeAuction` 100%
- **Alertas**: cron falló · error rate `placeBid` > 5% · storage > 80% cuota.

## 11. Migración futura a móvil (post-MVP)

- Crear `apps/mobile/` con Expo + React Native dentro del monorepo.
- Reusar `packages/shared-types/` y `packages/firebase-client/`.
- Sustituir vistas Next.js por screens RN (RN Navigation).
- Cloud Functions, Firestore, Rules, Storage se reusan al 100%.
- App Check con Play Integrity (Android) y App Attest (iOS).
- Notificaciones push con FCM.
- Distribución: TestFlight + Play Internal Testing → stores.

## 12. Roadmap de implementación (alto nivel)

Orden por prioridad de rol: **Admin primero → Staff → Comprador**. Se detallará por fases en `writing-plans`.

1. **Bootstrap monorepo** (Turborepo, Next.js, Functions, shared-types, lint/format/test, husky).
2. **Firebase setup** (proyecto `carbid-staging`, emulators, rules base, App Check).
3. **i18n + UI base + sistema de design** (next-intl, layout, sidebar, topbar, tema light/dark, tokens OKLCH, logo CARBID, fuentes).
4. **Auth + Users (núcleo)** (`createUser`, `updateUserRole`, `deleteUser`, sync de custom claims, login/logout, middleware de roles, settings comunes: perfil, seguridad, preferencias, danger-zone).
5. **Admin dashboard completo** (home con KPIs, gestión de usuarios con validación de dominio `santarosa.com.py`, audit log, configuración global `/admin/config` para moneda/incrementos/financiación/emails).
6. **Staff (User) dashboard** (wizard de vehículos, upload de imágenes, lista, edición; creación de subastas con form que respeta `app_config`).
7. **Buyer dashboard — catálogo y detalle** (catálogo con filtros, detalle de subasta con specs y carrusel, listener tiempo real).
8. **Buyer — pujas** (`placeBid` con transaction y anti-sniping; opciones rápidas + manual; rate limiting; vista "Mis pujas").
9. **Cierre de subastas + ganadores** (cron `closeAuction`, asignación de ganador, vista `/buyer/won`).
10. **Calculadora de cuotas** (`financing.calculateInstallments` + UI en detalle de subasta).
11. **CI/CD y deploy producción** (GitHub Actions, Netlify, Firebase staging y prod).
12. **E2E + hardening** (Playwright completo, App Check en prod, Sentry, alertas Cloud Monitoring, backups Firestore).

## 13. Decisiones cerradas y abiertas

### Cerradas en este spec

- **Moneda**: USD primaria por defecto, admin puede cambiar a PYG desde `/admin/config`. Operación interna siempre en USD.
- **Incrementos de puja**: fijo $500 USD + opción manual (toggle del admin).
- **Email admin/staff**: dominio obligatorio `santarosa.com.py` (validado server-side en `createUser`). Buyer: cualquier email válido (lo crea el admin).
- **Paleta y logo**: copper (`oklch(68% 0.13 55)`) + ink (`oklch(28% 0.04 290)`); logo split "CAR" copper / "BID" ink; tipografía Bricolage Grotesque + Inter.
- **Roadmap**: admin primero, luego staff, luego buyer.
- **Validación CI/RUC PY**: CI numérica sin check digit; RUC con dígito verificador formato `NNNNNNNN-D` (mod 11).
- **Financiación / cuotero**: configurable por admin (plazos `[12, 24, 36, 48, 60]`, tasa anual, % entrada, mínimo financiable). Buyer ve calculadora en detalle de subasta como simulación.

### Abiertas (a resolver en `writing-plans` o durante implementación)

- **Servicio de email transaccional**: Firebase Extensions (Trigger Email + SendGrid) vs Resend vs Mailgun. Recomendado **Resend** por DX si no hay restricción.
- **Plantillas de email** (texto y diseño): bienvenida con setup de contraseña, te superaron, ganaste, subasta no vendida.
- **Tipo de cambio PYG/USD**: por ahora manual desde `/admin/config`. Posible automatización post-MVP (BCP API o similar).
- **Política de retención de pujas tras eliminación de cuenta**: anonimizar `buyerSnapshot` vs preservar tal cual con flag `userDeleted`. Probable elección: anonimizar a "Usuario eliminado" preservando `amount` y `createdAt`.
- **Logo: ¿añadir un símbolo/lockup además del wordmark?** MVP: solo wordmark; postergar para post-MVP a menos que el usuario lo solicite.

## 14. Agentes recomendados por etapa de implementación

Para aprovechar `agency-agents` durante la implementación:

- **Bootstrap**: `Rapid Prototyper`, `DevOps Automator`
- **Auth & Cloud Functions**: `Backend Architect`, `Security Engineer`
- **Firestore Rules**: `Security Engineer`, `Database Optimizer`
- **UI / Settings / Dashboards**: `UI Designer`, `UX Architect`, `Frontend Developer`
- **i18n y accesibilidad**: `Frontend Developer`, `Accessibility Auditor`
- **Subastas y pujas**: `Backend Architect`, `Senior Developer`
- **Tests E2E**: `API Tester`, `Evidence Collector`, `Reality Checker`
- **CI/CD y producción**: `DevOps Automator`, `SRE`
- **Documentación**: `Technical Writer`
- **Coordinación pipeline completo**: `Agents Orchestrator`
