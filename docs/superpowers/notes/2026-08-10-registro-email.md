# Registro por email + contraseña — Notas de implementación

- **Fecha:** 2026-08-10
- **Rama:** `feat/registro-email`
- **Mirror de:** `functions/src/auth/registerGoogleBuyer.ts` (spec original:
  `docs/superpowers/specs/2026-07-20-google-signin-retail-design.md`, que
  dejó "registro público con email/contraseña" explícitamente fuera de
  alcance en v1 — esto es esa v2).

## 1. Qué se construyó

### Server (`functions/src/auth/`)

- **`registerPasswordBuyer.ts`** (nuevo) — callable público que mirra
  `registerGoogleBuyer` para el proveedor `password`:
  - No usa `requireSignedIn` (un usuario nuevo no tiene claims todavía).
  - Exige `token.firebase.sign_in_provider === 'password'` **y**
    `token.email_verified === true`. Si cualquiera falla:
    `failed-precondition / not_verified_password`, sin tocar Firestore.
  - Fuerza `role:'buyer'`, `audience:'retail'`, `status:'active'`
    server-side. `req.data` solo se lee para `firstName`/`lastName`
    (cosméticos, nunca privilegio) y ambos son **opcionales**: si el
    formulario de registro los manda, se validan estrictamente (mismo
    `NAME_RX` que `createUser`'s admin form); si el login-form los omite
    (caso de fallback, ver §3), se derivan de `token.name` /
    email-local-part vía el mismo mecanismo que ya usaba
    `registerGoogleBuyer`.
  - Nunca sobrescribe un `users/{uid}` existente — devuelve el rol real.
  - Rate-limit por uid: transacción con **todos los `tx.get()` antes de
    cualquier `tx.set()`** (mismo patrón que `placeBid.ts`), 5 intentos /
    10 min. Ver §4 para el razonamiento del número.
  - `region: 'us-central1'`, `enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false'`.
  - Auditoría vía `writeAuditLog` (`action: 'user.self_register'`,
    `after: {role, audience, provider:'password'}` — mismo `action` que
    Google, distinguible por `provider`).
- **`functions/src/lib/name.ts`** (nuevo) — extraje
  `sanitizeNamePart`/`deriveNameFromDisplayName` de `registerGoogleBuyer.ts`
  a un helper compartido (mismo regex, mismo comportamiento — es un
  refactor puro, sin cambio de conducta, cubierto por los 6 tests
  existentes de `registerGoogleBuyer.test.ts` que siguen en verde). Lo
  necesitaba `registerPasswordBuyer` para su propio fallback de nombre.
- **`functions/src/index.ts`** — export de `registerPasswordBuyer`.

### Client (`apps/web/src/`)

- **`app/[locale]/(auth)/register/page.tsx` + `register-form.tsx`** (nuevo,
  ruta propia) — mismo shell visual que `auth/set-password` y `auth/action`
  (RenewWordmark + PixelGrid + glass-surface card). Máquina de estados:
  `form → pending-verification → entering`. Ver §5 para cada copy.
- **`lib/auth/finalize-password-account.ts`** (nuevo) — helper compartido:
  `getIdToken(true)` → `registerPasswordBuyer` (best-effort, swallowed) →
  `getIdToken(true)` otra vez → `postSession`. Usado por `register-form.tsx`
  (con nombre explícito) y `login-form.tsx` (sin argumentos, ver §3).
- **`app/[locale]/(auth)/login/login-form.tsx`** (editado) — después de
  `signInWithEmailAndPassword`: si `!cred.user.emailVerified`, no intenta
  sesión — muestra el estado "todavía no verificaste" con reenviar/continuar
  (mismo bug que evita: antes de este cambio, esto caía en
  `postSession → account_disabled`, indistinguible de una cuenta
  desactivada por un admin). Si está verificado, llama
  `finalizePasswordAccount` en vez de `postSession` directo.
- **`app/[locale]/(auth)/login/page.tsx`** (editado) — el pie
  "¿No tenés cuenta? Creá una con Google en un paso." ya no era cierto;
  ahora enlaza a `/register`.
- **`middleware.ts`** (editado) — agregado `'register'` al allowlist
  `KNOWN_SEGMENTS`. Sin esto la ruta nueva devuelve 404 (el mismo patrón de
  bug de índices que el spec advierte, pero para rutas: el allowlist es
  fail-loud por diseño, así que lo agarré revisando el archivo, no en
  producción).

## 2. Regla de contraseña — qué elegí y por qué

**Mínimo 10 caracteres, con al menos una letra y un número.** Enforced
client-side en `register-form.tsx` vía zod.

Por qué 10 y no más: es una cuenta que puede comprometerse a comprar un
vehículo, así que el piso de Firebase (6) es claramente insuficiente — pero
un formulario de registro público debe seguir siendo "sencillo" (pedido
explícito del usuario). Fui con longitud como eje principal (guía NIST
800-63B actual: longitud > complejidad) más una regla mínima de letra+número
para bloquear los casos triviales (`1111111111`, `aaaaaaaaaa`) sin exigir
mayúscula/símbolo, que es la fricción que más abandono genera en un
formulario público. No usé 8 (el mínimo que ya existe en
`redeemPasswordReset.ts`/`set-password-form.tsx`) a propósito: esos flujos
son admin-mediados (invite-only), con una superficie de abuso mucho menor
que un registro público abierto a cualquiera en internet; me pareció
razonable que el auto-registro tenga un piso más alto sin tocar esos flujos
existentes (fuera de alcance, cero riesgo de regresión).

**Qué puede realmente enforcar el servidor: nada, directamente — y es
importante decirlo así de claro.** El diseño (paso 2 del brief) es que el
cliente cree el usuario de Firebase Auth directamente
(`createUserWithEmailAndPassword`) y dispare la verificación de Firebase.
Eso significa que **la contraseña en texto plano nunca llega a nuestro
backend** — va directo del browser a Identity Toolkit. `registerPasswordBuyer`
ni siquiera tiene un campo `password` en su `InputSchema`: no hay forma de
inspeccionarla server-side porque nunca la recibe. La única cosa que Firebase
mismo garantiza sin importar lo que haga nuestro código es su propio piso de
6 caracteres (hardcoded, no configurable desde `firebase-admin` ni desde el
SDK cliente). Un atacante que hable directo con la REST API de Identity
Toolkit (saltándose el formulario web) podría registrar una cuenta con una
contraseña de 6 caracteres sin que nuestro código se entere. Cerrar esa
brecha de verdad requeriría configurar **Identity Platform Password Policy**
a nivel de proyecto en la consola de Firebase (longitud mínima + reglas de
caracteres aplicadas por el propio backend de Identity Toolkit) — eso es
config de infraestructura, no código, y queda fuera de este PR (mismo patrón
que el spec de Google sign-in separó "Authorized domains" como config de
consola, no de código). Lo dejo anotado en Concerns.

## 3. Dónde vive el gate de "no verificado" y por qué

**El gate está en `registerPasswordBuyer.ts`, antes de tocar Firestore, y es
el único lugar donde importa.** Sin `users/{uid}` y sin custom claims, un
usuario recién creado por `createUserWithEmailAndPassword` no tiene rol
alguno: `requireSignedIn` (usado por `placeBid` y prácticamente todo callable
protegido) lo rechaza con `failed-precondition` por falta de claims, y las
reglas de Firestore (`isBuyer()` exige `role() == 'buyer' && isActive()`)
tampoco lo dejan leer ni escribir nada gateado por rol. Es literalmente la
misma garantía que ya usa `registerGoogleBuyer` — "sin doc y sin claims no
tienen rol" — así que no inventé un mecanismo nuevo, confirmé que el mismo
ya alcanza acá. No implementé "aprovisionar ahora, verificar después": eso
reabriría exactamente el agujero que el comentario de `registerGoogleBuyer`
describe (una cuenta sin verificar podría asociarse con — o eclipsar — un
email de staff/admin existente).

Client-side hay DOS puntos que intentan cerrar el ciclo, ambos llamando al
mismo callable a través de `finalizePasswordAccount`:

1. `register-form.tsx` — poll cada 4s (`user.reload()`) mientras se espera,
   más un botón manual "Ya verifiqué mi correo". Cross-tab/cross-dispositivo:
   si el enlace se abre en otra pestaña o en el celular, el poll lo detecta
   solo.
2. `login-form.tsx` — si alguien cierra la pestaña de registro y vuelve más
   tarde a loguearse normal, `finalizePasswordAccount` se llama igual (sin
   nombre explícito, con fallback a `token.name`/email). Esto es lo que
   evita que quedé "verificado pero nunca aprovisionado" para siempre — y es
   exactamente el caso que un bug real (§7) dejó demostrado en vivo.

## 4. Rate limit — el número elegido

5 intentos / 10 minutos por uid, mismo patrón transaccional que
`placeBid.ts` (todos los `tx.get()` antes de cualquier `tx.set()`). El
razonamiento: registrar una cuenta es, por diseño, una acción que ocurre
como máximo una vez por uid — una vez que `users/{uid}` existe, la rama
"existing" del handler no vuelve a escribir nunca (test:
"does not consume the rate limit budget when the account already exists",
8 llamadas seguidas sin gastar presupuesto). El límite protege
exclusivamente el _pre_-éxito: reintentos de red, un doble click en "ya
verifiqué", un cliente con bug en loop. No es la defensa principal contra
abuso — esa es `email_verified`, que exige controlar una casilla de correo
real por cada intento, mucho más caro que golpear la transacción.

## 5. Estados de usuario y su copy (todo en español, voseo)

| Estado                                                         | Dónde                                             | Copy                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Nombre/apellido vacío o con caracteres inválidos               | `register-form.tsx` (zod, client)                 | "Requerido" / "Máximo 40 caracteres" / "Solo letras, espacios, apóstrofes y guiones" (idéntico al form de admin)          |
| Email inválido                                                 | `register-form.tsx`                               | "Email inválido"                                                                                                          |
| Contraseña débil                                               | `register-form.tsx` (zod)                         | "Mínimo 10 caracteres" / "Incluí al menos una letra" / "Incluí al menos un número"                                        |
| Contraseñas no coinciden                                       | `register-form.tsx`                               | "Las contraseñas no coinciden"                                                                                            |
| Email ya registrado                                            | `register-form.tsx` (`auth/email-already-in-use`) | "Ese correo ya tiene una cuenta. Iniciá sesión en vez de crear una nueva."                                                |
| Falla genérica al crear cuenta                                 | `register-form.tsx`                               | "No pudimos crear tu cuenta. Probá de nuevo en unos minutos."                                                             |
| Pantalla de espera                                             | `register-form.tsx`                               | "Revisá tu correo" + "Te enviamos un enlace de confirmación a **{email}**. Abrilo para activar tu cuenta."                |
| Reenviar (éxito / cooldown / demasiados pedidos)               | `register-form.tsx` + `login-form.tsx`            | "Te reenviamos el correo de verificación." / "Reenviar en Ns" / "Esperá un momento antes de pedir otro correo."           |
| Todavía no verificado al chequear manualmente                  | ambos                                             | "Todavía no detectamos la verificación. Revisá tu correo."                                                                |
| Verificado pero no se pudo activar (edge case, ej. rate-limit) | ambos                                             | "Se verificó tu correo, pero no pudimos activar tu cuenta. Probá de nuevo."                                               |
| Arrepentirse del email tipeado                                 | `register-form.tsx`                               | botón "Usar otro correo" (signOut + reset)                                                                                |
| Login con cuenta sin verificar                                 | `login-form.tsx`                                  | "Todavía no verificaste tu correo. Revisá tu bandeja de entrada." + botones "Ya verifiqué, continuar" / "Reenviar correo" |
| Contraseña incorrecta al loguearse                             | `login-form.tsx` (sin cambios, ya existía)        | "Correo o contraseña inválidos."                                                                                          |
| Footer del login                                               | `login/page.tsx`                                  | "¿No tenés cuenta? Google arriba, o creála con tu email." (enlaza a `/register`)                                          |

Todas las cadenas nuevas de `register-form.tsx` están hardcodeadas en
español, igual que `forgot-password-dialog.tsx` (el componente más parecido
que ya existía: un form/dialog completo agregado después del setup i18n
original de `login-form.tsx`, y que tampoco usa `useTranslations`). Las
cadenas nuevas dentro de `login-form.tsx` sí me pareció que debían ir a
`es.json`/`en.json` — decidí no hacerlo para no forzar una traducción al
inglés apurada de un flujo nuevo y grande; quedó como hardcode consistente
con el resto del archivo, **anotado como concern** más abajo.

## 6. Reglas e índices de Firestore

**Ninguno de los dos necesitó cambios — lo verifiqué, no lo asumí.**

- `firestore.rules`: `users/{uid}` ya tiene `allow create, delete: if false`
  (todo alta pasa por Admin SDK); `rate_limits/{id}` ya tiene
  `allow read, write: if false` explícito. `registerPasswordBuyer` escribe
  ambas colecciones solo vía Admin SDK (bypassa las reglas), exactamente
  como `registerGoogleBuyer` y `placeBid` ya hacían. No agregué ninguna
  colección nueva.
- `firestore.indexes.json`: el callable solo hace `.doc()` gets dentro de la
  transacción (dos lecturas puntuales, `userRef` y `rlRef`) — cero queries
  con `where`, cero `orderBy`. No hace falta índice compuesto.

## 7. Un bug real encontrado y arreglado durante la verificación en browser

Los tests con emulador (`CallableRequest` construido a mano) no pueden
reproducir esto porque arman el token con los claims que quieran — así que
esto solo salió al probar en un browser real:

`user.reload()` actualiza la propiedad `emailVerified` del objeto `User`
local (un fetch fresco de la cuenta), pero **no** refresca el ID
token/JWT cacheado que `httpsCallable` adjunta automáticamente a la
llamada. Resultado: justo después de verificar, "Ya verifiqué, continuar"
llamaba a `registerPasswordBuyer` con el token viejo (emitido en el
signup, con `email_verified: false` — correcto en ese momento), y el
callable lo rechazaba con `failed-precondition` a pesar de que la cuenta
YA estaba verificada. Lo reproduje en vivo (`docs/.../ana.test@example.com`
y `sofia.benitez@example.com` quedaron verificados-pero-sin-claims por este
bug) y lo arreglé agregando `await user.getIdToken(true)` **antes** de
llamar al callable en `finalize-password-account.ts` (además del refresh
que ya hacía después, para levantar los custom claims nuevos). Verificado
de nuevo end-to-end tras el fix: éxito al primer intento, sin reintentos.

## 8. Evidencia TDD

Archivo: `functions/src/auth/registerPasswordBuyer.test.ts` (11 tests
nuevos). Rojo confirmado primero (`registerPasswordBuyer.js` no existía →
`Failed to load url`), luego implementación, luego verde:

```
npx -y firebase-tools emulators:exec --only auth,firestore --project carbid-test \
  'pnpm --filter @carbid/functions test'

Test Files  31 passed (31)
     Tests  291 passed (291)      # 280 baseline + 11 nuevos
```

Cobertura: alta feliz + claims + audit log; no sobrescribe cuenta existente
(mantiene rol staff); ignora role/audience/status inyectados desde el
cliente; rechaza email no verificado (sin tocar Firestore); rechaza
proveedor no-password; rechaza no-autenticado; deriva nombre desde
`token.name` cuando el cliente no manda nada (fallback de
`login-form.tsx`); fallback al local-part del email cuando tampoco hay
`token.name`; rechaza nombres explícitos con caracteres inválidos
(intento de inyección); rate-limit a las 5 llamadas; no gasta presupuesto
de rate-limit en cuentas ya existentes (8 llamadas seguidas, cero cobro).

`registerGoogleBuyer.test.ts` (6 tests, sin cambios de comportamiento)
sigue en verde después de extraer `deriveNameFromDisplayName` a
`lib/name.ts` — confirma que el refactor no rompió nada.

`pnpm --filter @carbid/functions typecheck` y `lint`: limpios.

Baseline web sin cambios: `pnpm --filter @carbid/web test` → **86/86**,
typecheck y lint limpios (no agregué tests unitarios de componentes React
— este repo no tiene infraestructura de testing-library/jsdom, el
`vitest.config.ts` de `apps/web` corre en `environment: 'node'` y los 86
tests existentes son todos de lógica pura, ningún componente. Seguí esa
convención y me apoyé en la verificación de browser para la parte de UI).

## 9. Evidencia de browser (emulators + dev server puerto 3012)

Pasos reales que hice, no un plan:

1. Creé `functions/.secret.local` con `RESEND_API_KEY=dummy-local-key`
   (no existía; sin esto el emulador tira de la key real de producción).
2. `pnpm --filter @carbid/functions build`, luego
   `pnpm emulators` (auth+firestore+functions+storage, proyecto
   `carbid-staging`) en background.
3. `preview_start` con la config `web-emulators` de `.claude/launch.json`
   (puerto 3012, ya apuntada a los mismos hosts de emulador).
4. **Registro feliz completo**: llené el formulario en `/es/register`
   (Carla Duarte), envié — pasó a "Revisá tu correo". Encontré el link de
   verificación real vía la API del emulador
   (`GET /emulator/v1/projects/carbid-staging/oobCodes`, que expone el
   link tal como indica la consigna en vez de mandar mail real) y lo
   apliqué. El poll automático lo detectó solo y terminó en
   `/es/retail` con "Hola, Carla" — confirmé además vía
   `accounts:query` del emulador de Auth que
   `customClaims = {role:'buyer', status:'active', audience:'retail'}`.
5. **Fallback cross-sesión** (login-form): con una cuenta que había quedado
   verificada-pero-sin-aprovisionar por el bug del App Check (ver más
   abajo), inicié sesión por el form normal de `/login` — se aprovisionó
   sola y aterrizó en el dashboard ("Hola, Ana"). Éste es justo el camino
   que homeliza a alguien que cerró la pestaña de registro.
6. **Email ya registrado**: reintenté `/register` con el email de Carla →
   "Ese correo ya tiene una cuenta. Iniciá sesión en vez de crear una
   nueva."
7. **Contraseña débil**: `abc123` → error de campo "Mínimo 10 caracteres"
   sin llegar a tocar Firebase.
8. **Contraseña incorrecta al loguearse**: → "Correo o contraseña
   inválidos."
9. **No verificado + reenviar + continuar**: registré una cuenta nueva, fui
   a `/login` sin verificar → "Todavía no verificaste tu correo..." con
   "Reenviar correo" (confirmé el nuevo envío) y "Ya verifiqué, continuar"
   (verifiqué por la API del emulador, clické, aterrizó en el dashboard).
10. Confirmé al final, vía la API de accounts del emulador, que las 5
    cuentas de prueba (`carla.duarte`, `ana.test`, `sofia.benitez`,
    `diego.silva`, `elena.paredes`) tienen exactamente
    `{role:'buyer', status:'active', audience:'retail'}` y ninguna otra
    cosa.

**Nota sobre el bug de App Check que encontré en el camino (no introducido
por mí, preexistente en todo callable del repo):** todo `onCall` acá usa
`enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false'`, y el
cliente deliberadamente **no** inicializa App Check cuando corre contra
emuladores (`apps/web/src/lib/firebase/client.ts`). Eso significa que
probar CUALQUIER callable — no solo el mío — contra el emulador desde el
browser sin arrancar `pnpm emulators` con `ENFORCE_APP_CHECK=false` da 401
en todos lados. No encontré este workaround documentado en ningún lado del
repo; lo infiero del propio patrón de código (`!== 'false'` en vez de
`=== 'true'` solo tiene sentido si la intención es permitir un opt-out
local). Lo dejo anotado en Concerns para que quede escrito en algún lado.

**Nota técnica sobre las herramientas de browser**: los clicks por
coordenada (`computer.left_click`) fueron intermitentes en este entorno
(el panel de browser no compositea frames — `screenshot` tira
"Browser pane is not displayed"). Cuando un click por ref no se reflejaba
en ningún request de red, usé `document.querySelector(...).click()` /
`.requestSubmit()` vía `javascript_tool` como alternativa — dispara
exactamente los mismos handlers de React que un click real, así que no
cambia lo que se estaba verificando.

## 10. Concerns

1. **Password policy real solo es enforceable a nivel de proyecto
   (Identity Platform), no en código** — ver §2. Recomiendo configurarlo en
   la consola de Firebase si se quiere cerrar la brecha del cliente que se
   salta el formulario web.
2. **`ENFORCE_APP_CHECK=false` no está documentado como paso necesario**
   para probar callables localmente contra el emulador desde un browser —
   afecta a todo el repo, no solo a este feature. Vale la pena agregarlo al
   script `emulators` de `package.json` o a un README de desarrollo.
3. Las cadenas nuevas de `login-form.tsx` (estado "no verificado" +
   reenviar) quedaron hardcodeadas en español en vez de sumarse a
   `es.json`/`en.json`, rompiendo la consistencia de que ese archivo es
   100% `useTranslations`. Las de `register-form.tsx` en cambio siguen el
   patrón de `forgot-password-dialog.tsx` (tampoco traducido). Si el
   locale `en` importa de verdad para este flujo, hace falta una pasada de
   traducción — la dejé fuera para no improvisar copy en inglés sin
   revisión.
4. `deno.lock` en la raíz del repo apareció como untracked ya desde antes
   de este trabajo (confirmé con `git status` en el paso 0) — no lo toqué,
   no es parte de este cambio.
5. No agregué un email de bienvenida al completar el registro (mismo
   criterio que `registerGoogleBuyer`: "ya entró, sin contraseña que crear"
   — acá tampoco hay nada que enviarle salvo la propia verificación que
   Firebase ya mandó).
