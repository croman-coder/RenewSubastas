# Google Sign-In + auto-registro retail — Design

- **Fecha:** 2026-07-20
- **Estado:** Aprobado (brainstorming) — pendiente plan de implementación
- **Autor:** equipo Renew + Claude
- **Rama:** `feat/google-signin`

## 1. Objetivo

Agregar un botón **"Continuar con Google"** en el login de Renew Subastas que
sirve tanto para **iniciar sesión** como para **registrarse**. Hoy la plataforma
es _invite-only_ (`createUser` es admin/staff-only); esto habilita
**auto-registro público**. Toda cuenta creada vía Google queda como
**`buyer` + audience `retail` + `status: active`**, con el rol **forzado en el
servidor** (el cliente no puede elegirlo).

### Fuera de alcance (YAGNI)

- Registro público con email/contraseña (sigue invite-only).
- Otros proveedores OAuth (Apple, Facebook).
- Email de bienvenida al auto-registrarse (v1 lo omite — ya entró, sin
  contraseña que crear).
- Banner proactivo "completá tu perfil" (v1 usa error-al-pujar).
- Alta wholesale por auto-registro (wholesale sigue siendo alta manual por
  staff/admin).

## 2. Decisiones (del brainstorming)

| Tema                           | Decisión                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| CI/RUC en signup Google        | **Se pide antes de pujar**, no en el registro. Perfil entra sin documento; la puja se bloquea hasta completarlo en `/settings/profile`. |
| Mecanismo de aprovisionamiento | **Callable** `registerGoogleBuyer` (sin blocking functions / Identity Platform).                                                        |
| Rol/audience                   | Forzados server-side: `buyer` / `retail`.                                                                                               |
| Email bienvenida               | No (v1).                                                                                                                                |
| Aviso perfil incompleto        | Solo error al intentar pujar + link a `/settings/profile` (v1).                                                                         |

## 3. Arquitectura

Flujo (feliz, usuario nuevo):

```
[Cliente] signInWithPopup(GoogleAuthProvider)
   -> usuario Google autenticado (sin claims aún)
[Cliente] httpsCallable(fb.functions,'registerGoogleBuyer')()   // sin args
   -> [Server] verifica provider google.com
      -> si users/{uid} NO existe: crea doc buyer+retail+active (sin CI/RUC)
      -> setUserClaims(uid, {role:'buyer',status:'active',audience:'retail'})
      -> devuelve {role,audience}
   -> si users/{uid} YA existe: devuelve rol/audience actual (NO sobrescribe)
[Cliente] getIdToken(true)         // refresca el JWT con los nuevos claims
[Cliente] POST /api/session {idToken}   // mismo flujo que login por password
   -> cookie de sesión + {role,audience}
[Cliente] router.replace(`/${locale}${homeFor(role,audience)}`)  // nuevo buyer -> /retail
```

Un solo botón cubre login y signup: si el doc ya existe (usuario recurrente, o
staff que linkeó Google con el mismo email), el callable no toca nada y conserva
su rol real.

## 4. Componentes

### 4.1 Cliente — `google-signin-button.tsx` (nuevo)

- Ubicación: `apps/web/src/app/[locale]/(auth)/login/google-signin-button.tsx`
  (co-localizado con `login-form.tsx`).
- `'use client'`. Patrón igual a los callables existentes
  (`revoke-sessions-button.tsx`): `httpsCallable` de `firebase/functions`,
  `fb` de `@/lib/firebase/client`, `toast` de `sonner`, `useRouter`,
  `useTranslations`.
- Recibe `{ from?: string; locale: string }` (igual que `LoginForm`) para
  respetar el `?from=` y rutear.
- Lógica:
  1. `const provider = new GoogleAuthProvider()`
  2. `const cred = await signInWithPopup(fb.auth, provider)`
  3. `await httpsCallable(fb.functions,'registerGoogleBuyer')()`
  4. `const idToken = await cred.user.getIdToken(true)`
  5. `POST /api/session` (reusar la misma lógica que `login-form.tsx`;
     extraer un helper `postSession(idToken)` compartido para no duplicar el
     manejo de errores `account_disabled` / `server_misconfigured` /
     `forbidden_origin`).
  6. Rutear con `homeFor(role, audience)`; reusar el `EnteringOverlay`.
- Errores manejados: `auth/popup-closed-by-user` y `auth/cancelled-popup-request`
  (silenciosos), fallo de red / App Check / callable → `toast` + mensaje i18n.
- Se monta en `login-form.tsx` debajo del form, con un divisor "o".

### 4.2 Server — callable `registerGoogleBuyer` (nuevo)

- Ubicación: `functions/src/auth/registerGoogleBuyer.ts`, exportado en
  `functions/src/index.ts`.
- `onCall({ region:'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK']==='true' }, handler)`
  (mismo patrón que `createUser`).
- **Sin input** (no acepta data del cliente → imposible inyectar rol/audience).
- Reglas:
  1. `requireSignedIn(req)` → uid.
  2. Verificar `req.auth.token.firebase.sign_in_provider === 'google.com'`;
     si no, `HttpsError('failed-precondition','not_google')`.
  3. Leer `users/{uid}`:
     - **Existe** → devolver `{ role, audience }` del doc, sin escribir.
     - **No existe** → crear doc:
       - `role:'buyer'`, `status:'active'`, `audience:'retail'` (constantes).
       - `email: req.auth.token.email`.
       - `profile`: `firstName`/`lastName` parseados de `req.auth.token.name`
         (primer espacio; fallback `''`), **sin** `documentType`/`documentNumber`,
         `audience:'retail'`.
       - `preferences`: defaults (locale `es`, theme `system`,
         notifications como en `createUser`).
       - `createdBy:'self:google'`, `provider:'google'`,
         `createdAt`/`updatedAt: serverTimestamp()`.
  4. `setUserClaims(uid, {role:'buyer',status:'active',audience:'retail'})`
     **directo** (evita la carrera con `onUserSync`, que igual dispara y es
     idempotente).
  5. `writeAuditLog({ actorUid:uid, action:'user.self_register', resourceType:'user', resourceId:uid, after:{role:'buyer',audience:'retail',provider:'google'} })`.
  6. Return `{ uid, role:'buyer', audience:'retail' }`.
- **Seguridad:** el rol nunca viene del cliente; nunca sobrescribe un doc
  existente (protege a un staff/admin que loguee con Google usando el mismo
  email → conserva su rol). Depende de que Firebase Auth esté en modo
  **"una cuenta por email"** (account linking) para no duplicar identidades.

### 4.3 Schema — documento opcional

- `packages/shared-types` `UserProfileSchema`: `documentType` y
  `documentNumber` pasan a **`.optional()`**. Espejo en
  `functions/src/_shared/user.ts`.
- Racional: los buyers auto-registrados no tienen documento al entrar. La
  completitud se exige en el momento de pujar (§4.4).
- `createUser` (alta por invitación) los **sigue exigiendo** en su propio
  `InputSchema` → los invitados siguen teniendo documento; solo el
  auto-registro los omite.

### 4.4 Gate de puja (perfil completo)

- **Server (autoritativo):** en `functions/src/auctions/placeBid.ts`, tras leer
  el perfil del buyer, exigir `profile.documentType` y `profile.documentNumber`
  no vacíos; si faltan → `HttpsError('failed-precondition','profile_incomplete')`.
- **Cliente:** en el flujo de puja, capturar el error `profile_incomplete` →
  `toast` con copy i18n + link a `/settings/profile`. Sin cambios de UI
  proactivos en v1.

### 4.5 Config Firebase / infra (fuera de código)

- **Authorized domains** (Firebase Auth → Settings): `renewsubastas.com.py`,
  el dominio `*.netlify.app` del site, y `localhost` (popup handler).
- **Provider Google**: habilitado (hecho). Setear **"una cuenta por email"**
  (link) para evitar duplicados por colisión de email.
- **CSP** (`netlify.toml`): agregar el authDomain de Firebase a `frame-src`
  (el helper del popup usa un iframe hacia `*.firebaseapp.com`). Hoy
  `frame-src 'self' https://www.google.com https://www.recaptcha.net` →
  agregar `https://*.firebaseapp.com`. Verificar el valor real de
  `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` y cubrirlo.

### 4.6 i18n

Nuevos textos en `apps/web/messages/{es,en}.json` bajo `auth.login`:

- `googleButton` ("Continuar con Google" / "Continue with Google")
- `orDivider` ("o" / "or")
- errores: `googleFailed`, `popupBlocked`
- gate de puja: `profileIncompleteToast` + label del link.

## 5. Manejo de errores

| Situación                              | Comportamiento                                                       |
| -------------------------------------- | -------------------------------------------------------------------- |
| Popup cerrado/cancelado por el usuario | Silencioso, sin toast.                                               |
| App Check / red / callable falla       | Toast `googleFailed`; `signOut()` para no dejar sesión a medias.     |
| `/api/session` → `account_disabled`    | Mismo copy que el login por password.                                |
| Provider != google.com en el callable  | `failed-precondition: not_google` (no debería pasar desde el botón). |
| Buyer sin documento intenta pujar      | `failed-precondition: profile_incomplete` → toast + link a perfil.   |

## 6. Tests

- **Callable** (`registerGoogleBuyer.test.ts`): usuario nuevo crea doc
  buyer+retail+active + claims; usuario existente NO se sobrescribe; provider no
  google → rechaza; sin input aceptado (no hay inyección de rol).
- **placeBid**: rechaza `profile_incomplete` cuando falta documento; permite
  cuando está completo.
- **Schema**: `UserProfileSchema` acepta perfil sin `documentType`/`documentNumber`.

## 7. Aislamiento / interfaces

- `registerGoogleBuyer`: entra un usuario Google autenticado (uid + token),
  sale `{uid,role,audience}`. Depende de `adminAuth`, `adminDb`, `setUserClaims`,
  `writeAuditLog`. Testeable con el handler exportado (patrón `createUser`).
- `google-signin-button.tsx`: unidad de UI aislada; depende de `fb`, el callable
  y `POST /api/session`. El helper `postSession` se comparte con `login-form.tsx`.

## 8. Deploy

Orden:

1. `pnpm --filter @carbid/shared-types build`
2. **Functions** (nuevo callable + cambio en `placeBid`):
   `pnpm --filter @carbid/functions deploy` (o CI si se arregla).
3. **Web** (botón + CSP + i18n): deploy manual Netlify (prod **no** git-conectado):
   `netlify deploy --build --prod --filter @carbid/web --site 5ecfa35d-a428-452f-9c48-115a0b257114`.
4. Config Firebase (authorized domains, "una cuenta por email") antes o junto al
   deploy web.

Nota: el schema opcional se despliega vía functions (y va embebido en el bundle
web). Coordinar functions+web para no dejar el gate de puja sin el server.

## 9. Riesgos

- **Registro abierto**: cualquier cuenta Google entra como retail. Aceptado (es
  el objetivo). Mitigación de abuso futura: rate-limit / verificación → fuera de
  v1.
- **Colisión de email** (staff con gmail): mitigado por "una cuenta por email" +
  el callable que no sobrescribe docs existentes.
- **Perfiles incompletos**: aceptable; el gate de puja garantiza documento antes
  de mover dinero.
