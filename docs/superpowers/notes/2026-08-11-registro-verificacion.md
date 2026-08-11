# Verificación en browser — gate de verificación de email y fix del lockout

- **Fecha:** 2026-08-11
- **Rama:** `feat/registro-email`
- **Commit verificado:** `bad6f7deac253a6c9c79183e9ef159eb0036c448` — _"fix(auth): stop the new
  login gate from locking out every invited account"_
- **Alcance:** solo verificación en browser contra emuladores. No se tocó código de aplicación.

## Veredicto

**El Critical está arreglado.** Una cuenta staff invitada por el flujo real del panel admin
(`createUser`, que deja `emailVerified:false`) redime su invitación y después inicia sesión
sin problema, aterrizando en su dashboard — no en la pantalla de "todavía no verificaste".
El registro público end-to-end también funciona. El gate de no-verificado sigue protegiendo
correctamente su caso legítimo (usuario auto-registrado que nunca clickeó el link). El script
de backfill hace exactamente lo que dice, es idempotente, y no toca lo que no debe.

Se encontraron **dos bugs** durante la verificación (ninguno es el Critical, ninguno se arregló
— solo se reportan, según lo pedido). Detalle en la sección "Bugs encontrados".

---

## 0. Prueba de entorno

```
$ cd /home/croman/Escritorio/CARBID && pwd && git branch --show-current && git status --short
/home/croman/Escritorio/CARBID
feat/registro-email
(árbol limpio)

$ git log -1 --format='%H %s'
bad6f7deac253a6c9c79183e9ef159eb0036c448 fix(auth): stop the new login gate from locking out every invited account
```

- `functions/.secret.local` ya existía con `RESEND_API_KEY=dummy-local-key` (no hizo falta crearlo).
- `pnpm --filter @carbid/functions build` — recompilado antes de arrancar, para no depender de un
  `lib/` viejo. Confirmé en el output compilado: `functions/lib/auth/redeemPasswordReset.js` tiene
  `emailVerified: true` (el fix); `functions/lib/auth/createUser.js` tiene `emailVerified: false`
  (el comportamiento que causaba el lockout).
- Emuladores: `ENFORCE_APP_CHECK=false firebase emulators:start --only auth,firestore,functions,storage
--import=./.emulator-data --export-on-exit=./.emulator-data --project carbid-staging`. Los 4
  arrancaron ("All emulators ready"), incluidas `createUser`, `redeemPasswordReset`,
  `registerPasswordBuyer`. **El emulador de Firestore no se cayó ni una vez** en toda la sesión (sin
  señales de crash en el log; proceso java vivo de punta a punta).
- Confirmé que `ENFORCE_APP_CHECK=false` realmente desactiva el chequeo — log del emulador:
  `"verifications":{"app":"MISSING","auth":"..."} ... "Callable request verification passed"` en
  cada invocación. Sin esto todos los callables hubieran fallado con 401 antes de llegar a la lógica.
- Admin semilla: `pnpm seed` → `admin@santarosa.com.py` / `Carbid123!` (vía `bootstrap-admin.ts`,
  que marca `emailVerified:true` directo — **no** es el mismo camino que `createUser`, así que
  no sirve para probar el lockout; se usó solo para entrar al panel admin y crear cuentas invitadas
  reales desde ahí).
- Web: `pnpm dev:web` → Next.js en `http://localhost:3100`, apuntado a los emuladores
  (`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`
  desde `apps/web/.env.local`).
- **Verifiqué que ambos procesos corren desde este checkout**, no desde otro worktree:
  ```
  $ readlink -f /proc/72214/cwd   # next-server
  /home/croman/Escritorio/CARBID/apps/web
  $ readlink -f /proc/71637/cwd   # java (firestore emulator)
  /home/croman/Escritorio/CARBID
  ```
- **Ningún email real salió.** Se intentaron 2 envíos de bienvenida (los dos `createUser` que hice
  más abajo); ambos fueron rechazados por Resend con `401 API key is invalid` (la key dummy
  funcionando como red de seguridad):
  ```
  [email] resend rejected send { to: 'staff.invitada@santarosa.com.py', ... message: 'API key is invalid' }
  [email] resend rejected send { to: 'admin.pendiente@santarosa.com.py', ... message: 'API key is invalid' }
  ```
- **Nota de herramientas de browser:** en este entorno, `computer.left_click` por coordenada fue
  intermitente para submits de formulario (el panel no compositea frames — `screenshot` devuelve
  "Browser pane is not displayed"). Cuando un click no producía ningún request de red, usé
  `document.querySelector(...).click()` vía `javascript_tool` como alternativa — dispara los mismos
  handlers de React que un click real (confirmado: el mismo patrón ya lo documentó la sesión anterior
  en `docs/superpowers/notes/2026-08-10-registro-email.md`, así que no es específico de esta sesión).
  No cambia qué se estaba verificando, solo cómo se disparó el evento.

---

## 1. Cuenta staff invitada — el regression que más importa

**Setup:** logueado como el admin semilla, usé el formulario real del panel
(`/es/admin/users/new`, el mismo que usa un admin de verdad) para invitar una cuenta **Staff**:
_Silvia Invitada_ — `staff.invitada@santarosa.com.py`. Esto pasa por el callable `createUser` real.

**Verificado por Admin SDK antes de tocar nada más** (para confirmar que efectivamente reproduce
la precondición del bug — no asumido):

```
AUTH USER: { emailVerified: false, disabled: false, customClaims: { role: "staff", status: "active" } }
FIRESTORE DOC exists: true
```

**Acciones:**

1. El panel mostró el link de reset inline (fallback "si no llega el mail, copiá este link"):
   `https://renewsubastas.com.py/es/auth/set-password?token=c9996d45...` (dominio de prod hardcodeado
   en el email — se lo cambió por `localhost:3100` para probar local, el token y el path se usaron
   tal cual).
2. Cerré sesión del admin, abrí el link de set-password, cargué contraseña `StaffPass2026!`.
3. Pantalla mostrada: **"Contraseña lista" / "Ya podés iniciar sesión con tu nueva contraseña."**
4. Verifiqué de nuevo por Admin SDK: `emailVerified` pasó de `false` a **`true`**. El doc del token
   (`password_set_tokens`) tiene `usedAt` seteado **una sola vez** (no se consumió dos veces). El log
   de auditoría tiene exactamente 2 entradas para ese uid: `user.create` (actor: el admin) y
   `user.password_set` (actor: la propia cuenta) — sin duplicados.
5. Fui a `/es/login`, ingresé `staff.invitada@santarosa.com.py` / `StaffPass2026!`, envié.

**Resultado:** aterrizó en `http://localhost:3100/es/staff` — el dashboard de staff ("Mi panel",
nav con Vehículos/Subastas/Ventas/Pujas/Reporte). **No** mostró la pantalla de no-verificado.
Confirmé en el log del emulador que `registerPasswordBuyer` corrió con `"auth":"VALID"` (token
fresco, claims OK) y que `POST /api/session` devolvió `200 OK` (la cookie de sesión del admin fue
reemplazada limpiamente por la de Silvia).

**Esto es exactamente el escenario que estaba roto antes de `bad6f7d`**: una cuenta creada por
`createUser` (que SIEMPRE deja `emailVerified:false`) que redime su invitación. Con el gate viejo
(que miraba `emailVerified` antes de intentar aprovisionar), esto hubiera caído en la pantalla de
"Todavía no verificaste tu correo" pese a ser una cuenta admin-invitada real, sin ninguna manera de
salir de ese estado desde la UI. Con el fix, no.

---

## 2. Registro público end-to-end (happy path)

**Acciones:** en `/es/register`, cargué _Beatriz Compradora_ — `beatriz.compradora@example.com`
/ `Compra2026Segura` (cumple el mínimo de 10 caracteres + letra + número). Envié.

**Pantalla mostrada:** **"Revisá tu correo" / "Te enviamos un enlace de confirmación a
beatriz.compradora@example.com. Abrilo para activar tu cuenta."**

Como pide la consigna, usé el propio emulador de Auth en vez de esperar un mail real:

```
$ curl http://127.0.0.1:9099/emulator/v1/projects/carbid-staging/oobCodes
{"oobCodes":[{"email":"beatriz.compradora@example.com","requestType":"VERIFY_EMAIL",
  "oobCode":"d4XL5X8vbXhAokjJlUYH_qP0pSTJrI1mJ1zNj4vvGgM5M2p9hsXGN2", ...}]}
```

Abrí `http://localhost:3100/es/auth/action?mode=verifyEmail&oobCode=<code>` en una pestaña nueva
(simulando "clickear el link del mail" en otro dispositivo/pestaña).

**Lo que pasó ahí es el primer bug encontrado** (ver sección de bugs): esa pestaña mostró
**"Enlace no válido" / "El enlace expiró o ya fue usado."** — un falso negativo. Verificado por
Admin SDK en el momento: la cuenta **sí** quedó `emailVerified:true` con claims
`{role:"buyer", status:"active", audience:"retail"}` ya seteados. La pantalla mentía.

Mientras tanto, la pestaña original de registro (con el poll cada 4s de `register-form.tsx`) detectó
la verificación sola y avanzó automáticamente: terminó en `http://localhost:3100/es/retail` con
**"Hola, Beatriz — estas son las unidades disponibles ahora."** — el dashboard real de buyer retail.

Para confirmar que el bug de la pantalla de error no bloquea nada, until probé el camino de
recuperación: en la pestaña que había mostrado el error, fui a `/login` e inicié sesión con
`beatriz.compradora@example.com` / `Compra2026Segura` normalmente → funcionó, aterrizó en
`/es/retail` también. La cuenta está sana; solo la pantalla del link mintió una vez.

**Veredicto de este escenario: el flujo funciona end-to-end.** El bug encontrado es de UI/mensaje,
no bloquea al usuario real (ver detalle abajo).

---

## 3. Estados que le pasan a una persona común

### a) Email que ya tiene cuenta

Reintenté `/register` con el email de Beatriz (ya verificado).
**Pantalla:** **"Ese correo ya tiene una cuenta. Iniciá sesión en vez de crear una nueva."**

### b) Contraseña débil

Registré `debil.password@example.com` con contraseña `abc123`.
**Pantalla:** error de campo inline **"Mínimo 10 caracteres"** — validación 100% cliente (zod), no
se disparó ningún request de red (confirmado por network log).

### c) Contraseña incorrecta en un login posterior

Con la cuenta ya verificada de Beatriz, intenté loguear con una contraseña equivocada.
**Pantalla:** **"Correo o contraseña inválidos."**

### d) Usuario auto-registrado que NO clickeó el link, intenta loguearse

Registré una cuenta nueva — _Nora Pendiente_ / `nora.pendiente@example.com` — y **deliberadamente
no verifiqué el email**. Fui directo a `/login` con esas credenciales.

**Pantalla:** **"Todavía no verificaste tu correo. Revisá tu bandeja de entrada."** con los botones
**"Ya verifiqué, continuar"** y **"Reenviar correo"** visibles.

Este es exactamente el caso para el que existe el gate, y sigue andando: una cuenta que genuinamente
nunca probó control de su casilla se queda afuera del dashboard. La diferencia con el bug que
arregló `bad6f7d` es que Nora **no tiene doc en `users/{uid}`** (nunca se aprovisionó, porque
`registerPasswordBuyer` exige `email_verified:true` antes de escribir nada) — mientras que una
cuenta invitada por `createUser` sí tiene doc desde el día uno. Esa distinción (doc existe / no
existe) es la misma que usan tanto el fix como el script de backfill para no confundir un caso con
el otro.

---

## 4. Script de backfill

Leí `functions/scripts/backfill-verified-invited-accounts.mjs` antes de correrlo. Su lógica: recorre
todos los usuarios de Auth, salta los ya verificados, y para cada no-verificado chequea si existe
`users/{uid}` en Firestore — si existe, es una cuenta invitada que redimió antes del fix (`createUser`
escribe el doc en el momento de invitar, mucho antes de que exista contraseña) y la marca
`emailVerified:true`; si no existe, es un auto-registro abandonado/en curso y lo deja intacto. Es la
misma señal (doc existe vs. no) que usa `sweepUnverifiedAccounts.ts` en otro lugar del repo para la
misma distinción.

**Precondición armada a propósito**, para no simular sino reproducir el estado real:

- Invité una segunda cuenta admin por el panel real — _Pendiente DeVerificar_ /
  `admin.pendiente@santarosa.com.py` — y esta vez **no** redimí el link. Quedó
  `emailVerified:false` + doc existe → el objetivo que el script debe arreglar.
- Ya tenía a Nora (`nora.pendiente@example.com`): `emailVerified:false` + **sin** doc → el control
  negativo, no debe tocarse.
- Las otras 8 cuentas ya estaban verificadas → deben quedar sin cambios (prueba de que no rompe
  nada existente).

**Estado antes** (Admin SDK, 10 cuentas total):

```
admin.pendiente@santarosa.com.py  | verified=false | hasDoc=true  | role=admin   ← objetivo
nora.pendiente@example.com        | verified=false | hasDoc=false | role=-       ← control negativo
...8 cuentas más, todas verified=true
```

**Corrida** (comando documentado, sin modificar el script, contra el emulador):

```
$ cd functions
$ FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/backfill-verified-invited-accounts.mjs

Scanning Auth users for invited-but-unverified accounts...
  verified: 5aX4oWt3t3aJEhBJMhgTjMkaOq3N (admin.pendiente@santarosa.com.py)

Done. Backfilled 1 invited account(s). Left 1 unverified self-registration(s) untouched.
```

**Estado después:** `admin.pendiente@santarosa.com.py` → `verified=true`. `nora.pendiente@example.com`
sigue `verified=false, hasDoc=false`, sin tocar. Las otras 8 cuentas: `verified`, `role` y `disabled`
idénticos a antes — el script no tocó nada que no debía.

**Idempotencia:** lo corrí una segunda vez, mismo comando:

```
Scanning Auth users for invited-but-unverified accounts...

Done. Backfilled 0 invited account(s). Left 1 unverified self-registration(s) untouched.
```

Cero cambios en la segunda pasada, como promete el comentario del propio script.

### Invocación exacta contra producción

**Ojo — esto es un hallazgo, no solo una instrucción de uso.** El script tiene hardcodeada la ruta
de credenciales en la línea 33:

```js
const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
```

Confirmé el `project_id` de ese archivo: es `carbid-staging`, **no** `carbid-59ef5` (el proyecto de
producción real de `renewsubastas.com.py`, según `docs/PRODUCTION_RUNBOOK.md` y
`docs/GO-LIVE-renewsubastas.md`). El otro archivo, `/home/croman/keys/carbid-prod-sa.json`, sí tiene
`project_id: carbid-59ef5`.

Esto significa que **correr la línea de uso documentada en el propio script, tal cual está, apunta a
staging, no a producción** — sin `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` de por medio,
igual pega contra el proyecto equivocado (el de staging real en la nube, no el emulador). No hay
flag `--project` ni variable de entorno para overridear, a diferencia del resto de la tooling de
ops de este repo (`docs/PRODUCTION_RUNBOOK.md` usa `--project carbid-59ef5` en todos lados).

**Para correrlo de verdad contra producción**, tal como está el script hoy, hace falta:

1. Editar la línea 33 para que lea `/home/croman/keys/carbid-prod-sa.json` en vez de
   `carbid-staging-sa.json` (edición manual, no hay otra forma con el script actual).
2. Correr, sin ninguna variable de emulador seteada:
   ```
   cd functions
   node scripts/backfill-verified-invited-accounts.mjs
   ```

No hice ese cambio ni corrí nada contra producción — solo lo documento como está. Este es el
**segundo bug** de esta verificación (ver abajo).

---

## Bugs encontrados (reportados, no arreglados — según lo pedido)

### Bug 1 — falso "enlace inválido" al verificar email (doble disparo del action handler)

**Archivo:** `apps/web/src/app/[locale]/(auth)/auth/action/action-handler.tsx` (preexistente,
del commit `10a4093`, 2026-06-11 — **no** es parte del diff de este PR, pero el flujo de
auto-registro nuevo lo usa para el paso de verificación).

**Qué pasa:** el `useEffect` que llama `applyActionCode`/`verifyPasswordResetCode` no tiene ninguna
protección contra el doble-invoke deliberado de React 18 Strict Mode en desarrollo
(`next.config.mjs` tiene `reactStrictMode: true`). El guard `cancelled` que ya existe solo evita que
la PRIMERA instancia del efecto actualice su propio estado después de desmontarse — no evita que la
red dispare la llamada dos veces. Con un oobCode de un solo uso, la primera llamada tiene éxito
(200) y la segunda falla porque el código ya se consumió (400) — y como la segunda instancia es la
que queda "viva" (`cancelled=false`), es la que gana y pinta el error.

**Evidencia (network log, una sola navegación real, sin recargar):**

```
POST .../accounts:update?key=... → 200 OK
POST .../accounts:update?key=... → 400 Bad Request
```

Pantalla resultante: **"Enlace no válido" / "El enlace expiró o ya fue usado."**
Estado real de la cuenta en ese momento (Admin SDK): `emailVerified: true`, claims ya seteados.

**Impacto:** confuso pero no bloqueante. La cuenta queda verificada y aprovisionada de verdad — lo
confirmé logueando con esas credenciales inmediatamente después, funcionó sin problema. El daño es
que un usuario real, viendo "el enlace expiró o ya fue usado" en su primer click genuino, puede
asumir que algo salió mal y no darse cuenta de que ya puede iniciar sesión.

**Alcance de la reproducción:** Strict Mode solo duplica efectos en `next dev` — una build de
producción no lo hace (es explícitamente un diagnóstico de desarrollo). No probé contra una build
de producción (`next build && next start`), así que no puedo afirmar que este mismo disparo doble
ocurra ahí. Lo que sí es cierto independientemente del entorno: el efecto no tiene ningún mutex/guard
contra ejecutarse dos veces para el mismo código (por Strict Mode, por abrir el link en dos
pestañas, por un refresh accidental de la página), así que la clase de bug (segunda llamada gana y
pisa el éxito de la primera) es real más allá de si Strict Mode es la única forma de gatillarlo hoy.

### Bug 2 — el script de backfill apunta a staging, no a producción, sin aviso

Ver sección 4 arriba. `functions/scripts/backfill-verified-invited-accounts.mjs:33` tiene
hardcodeado `/home/croman/keys/carbid-staging-sa.json`. Correr el comando tal como lo documenta el
propio script (`node scripts/backfill-verified-invited-accounts.mjs`) sin editar nada apunta al
proyecto `carbid-staging`, no a `carbid-59ef5` (producción real). No hay `--project` ni variable de
entorno de override, a diferencia del resto de scripts de ops del repo.

---

## Resumen de cuentas de prueba usadas (todas en el emulador `carbid-staging`, no en ningún entorno real)

| Cuenta                             | Rol          | Camino                                                         | Estado final                                         |
| ---------------------------------- | ------------ | -------------------------------------------------------------- | ---------------------------------------------------- |
| `admin@santarosa.com.py`           | admin        | `pnpm seed` (bootstrap-admin, emailVerified:true directo)      | usado para operar el panel                           |
| `staff.invitada@santarosa.com.py`  | staff        | `createUser` → redimido → login                                | **verificado, logueó OK**                            |
| `beatriz.compradora@example.com`   | buyer/retail | auto-registro → verificado (con el bug 1 de por medio) → login | **verificado, logueó OK**                            |
| `debil.password@example.com`       | —            | auto-registro rechazado por password débil                     | nunca se creó                                        |
| `nora.pendiente@example.com`       | —            | auto-registro, nunca verificado (a propósito)                  | gate activo, sin doc — control negativo del backfill |
| `admin.pendiente@santarosa.com.py` | admin        | `createUser`, invitación nunca redimida (a propósito)          | objetivo del backfill — verificado por el script     |

---

## Entorno dejado corriendo

Al terminar esta verificación dejé los emuladores (puertos 9099/8080/9199/5002, UI en 4000) y el
dev server (`localhost:3100`) corriendo, por si querés entrar a mirar vos mismo. Si los parás con
Ctrl+C, el flag `--export-on-exit` va a persistir estas 6 cuentas de prueba en `.emulator-data`
(mezcladas con las 5 demo de `pnpm seed:demo`) — no es destructivo, pero avisá si preferís que
lo reinicie limpio.
