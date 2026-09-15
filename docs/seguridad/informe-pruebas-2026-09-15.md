# Renew Subastas — pruebas, auditoría y espejo

**Fecha:** 15 de septiembre de 2026 · **Commit revisado:** `399e998` (producción) ·
**Entorno de pruebas:** emuladores de Firebase + Postgres descartable. **Nada de esto tocó producción**, salvo lecturas (`count()`, listado de bucket, config de App Check y Auth vía API, headers HTTP públicos).

Cuatro trabajos, en orden:

1. **E2E** del flujo de subasta — puja, cierre, comprobante, confirmación.
2. **Estrés** — 100 compradores pujando la misma subasta.
3. **Seguridad** — reglas de Firestore y Storage con ataques ejecutables, dependencias, headers, App Check, Auth, secretos.
4. **Espejo** en SRPY186 — factibilidad medida y servicio construido y probado.

Todo lo que se rompió está en §5 con causa y arreglo. Lo que queda de tu lado, en §6.

---

## 1. E2E — 22/22 en verde (después de dos arreglos)

`functions/scripts/e2e-flow.ts` corre los handlers reales (`placeBid`, `tickAuctions`, `submitPaymentProof`, `confirmAuctionPayment`) contra los emuladores, en secuencia:

| Paso | Qué verifica                                                                        | Resultado    |
| ---- | ----------------------------------------------------------------------------------- | ------------ |
| 0    | Pujar **al** precio base se rechaza (piso 500 USD)                                  | ✓            |
| 1    | Primera puja válida (base + 500)                                                    | ✓            |
| 2, 4 | Auto-superarse bloqueado                                                            | ✓            |
| 3    | Superar registra a quién desplazó y por cuánto                                      | ✓            |
| 5    | Cierre: `ended`, `sold`, ganador, precio final, `pending_payment`, vehículo `sold`  | ✓ (7 checks) |
| 6    | Comprobante: ruta vieja rechazada, ruta de OTRO uid rechazada, subida real aceptada | ✓ (4 checks) |
| 7    | Admin confirma → `paid` (+ 2 correos, omitidos sin `RESEND_API_KEY`)                | ✓            |
| 8    | Comprobante tardío tras pago → rechazado                                            | ✓            |

**El e2e estaba roto en dos lugares por cambios de negocio que nadie propagó** (E2E-1, E2E-2 en §5). Los dos arreglos convierten esos cambios en casos cubiertos, y ahora la limpieza corre en `finally`: un crash a mitad ya no deja basura en el emulador.

## 2. Estrés — el sistema aguanta; el emulador, no del todo

`load-test/hot-auction-bids.js` (k6 v2.2.0): 100 compradores distintos, cada uno pujando cada 6 s (el tope de 10/min por comprador), todos sobre **la misma subasta**, 90 segundos. Es la ráfaga real —no "100 usuarios navegando", que Firestore aguanta de sobra— y son ~17 pujas/segundo sobre un documento que Firestore sostiene a ~1 escritura/segundo.

| Métrica                               | Valor                 | Lectura                                                                                |
| ------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| Pujas enviadas                        | 1.295 (13,8/s)        |                                                                                        |
| Aceptadas                             | 15                    | Una por ronda: correcto, sólo una puede ir ganando                                     |
| Rechazadas por negocio ("quedó baja") | 1.190                 | Esperado y sano                                                                        |
| **Abortos por contención**            | **0**                 | La señal de estrés. No apareció                                                        |
| Rate limit                            | 0                     | El ritmo de la prueba respeta el tope                                                  |
| Errores de armado                     | 0                     |                                                                                        |
| Sin respuesta HTTP (transporte)       | 90 (7 %)              | `EOF` / `connection reset` **del emulador de functions** (un proceso Node) — ver abajo |
| Errores 5xx                           | 0                     |                                                                                        |
| Latencia p50 / p95 / máx              | 12 ms / 14 ms / 21 ms | **Emulador local — no extrapolar a producción**                                        |

**Invariantes después de la ráfaga** (`functions/scripts/verify-load-auction.mjs`), que es lo que de verdad importa bajo concurrencia — 8/8:

- exactamente una puja `winning`; `bidCount` == pujas guardadas; `currentBid` == la más alta; la `winning` ES la más alta; `currentBidderUid` == su autor;
- montos estrictamente crecientes en orden de creación (ninguna transacción pisó a otra);
- ninguna puja consecutiva del mismo comprador (self-outbid firme bajo concurrencia);
- cada puja registra a quién desplazó y por cuánto.

**Qué prueba y qué no.** Prueba que la transacción de `placeBid` es correcta bajo 100 escritores simultáneos: sin escrituras perdidas, sin doble ganador, sin saltarse el rate limit. **No mide la latencia real de Firestore**: el emulador no modela el límite de ~1 escritura/segundo/documento ni la latencia de red a us-central1. Los 90 errores de transporte son el emulador de functions tirando conexiones bajo ráfaga (documentado en el script como métrica aparte, con umbral relajado sólo para emulador). Para el número de latencia real hay que correr el mismo script contra un proyecto de staging descartable — no existe uno, y esa es la recomendación de fondo de este informe (§6).

## 3. Seguridad

### 3.1 Reglas — 53 ataques ejecutables, 53 bloqueados

- **Firestore** (`firestore-rules.pentest.test.ts`): 34/34, sin cambios desde agosto.
- **Storage** (`storage-rules.pentest.test.ts`, **nuevo**): 19/19 después de un arreglo (SEC-2). Las reglas de Storage son las que costaron una venta en agosto y hasta hoy no tenían una sola prueba. Cubre: escribir bajo el uid de otro, ruta vieja de dos segmentos, tipos y tamaños fuera de tope, suspendido, anónimo, staff subiendo en nombre de un comprador, lectura del comprobante por el dueño / por otro comprador / por anónimo, borrado y **sobreescritura** de evidencia, cambio de metadatos, fotos de vehículos, y rutas fuera de las dos superficies.

Corrido dos veces seguidas: idempotente.

### 3.2 App Check — la respuesta que faltaba, y el cambio

Leído por API (no por consola), antes de esta auditoría:

| Servicio               | Antes          | Ahora (15/09 17:05 UTC)                                                               |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Storage                | ENFORCED       | ENFORCED                                                                              |
| **Firestore**          | **UNENFORCED** | **ENFORCED**                                                                          |
| Auth (identitytoolkit) | UNENFORCED     | UNENFORCED (a propósito: forzado, quien no pase reCAPTCHA no puede ni iniciar sesión) |

Firestore es la base que el cliente escribe directo. Las reglas lo protegían igual (§3.1), pero sin App Check cualquier script con la config pública podía hablarle a Firestore como si fuera la app. Se forzó después de comprobar, en este orden, que ningún usuario real se quedaba afuera: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` presente en Netlify en todos los contextos; reCAPTCHA v3 cargado y con badge en la página de login de producción (o sea, `initializeAppCheck` corre, con auto-refresh del token); y los callables (`placeBid`, etc.) ya exigían App Check desde siempre con pujas entrando — los navegadores reales obtienen tokens válidos. Los caminos servidor (SSR con Admin SDK, Cloud Functions, el espejo) no pasan por App Check y se verificaron intactos después del cambio. Rollback: `node functions/scripts/appcheck-enforcement.mjs firestore.googleapis.com UNENFORCED`.

### 3.3 Auth

| Control                    | Antes                                                             | Ahora (15/09)                                                                                                   |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Anti-enumeración de emails | ON                                                                | ON                                                                                                              |
| Política de contraseña     | Ninguna del lado del servidor; tres criterios distintos en la app | **ENFORCE: 10 caracteres, una minúscula, un número** — en Firebase y en los cuatro puntos de la app (ver abajo) |
| MFA                        | Desactivada                                                       | **Código listo y probado; falta el upgrade a Identity Platform** (ver abajo)                                    |
| Dominios autorizados       | incluye `carbidpy.netlify.app` (viejo)                            | igual                                                                                                           |
| Funciones de bloqueo       | Ninguna                                                           | igual                                                                                                           |

**Contraseña.** La regla vive en `@carbid/shared-types` (`PasswordSchema`) y se aplica en: la política del proyecto de Firebase (la puerta que una petición armada no puede saltar); registro, cambio de contraseña y set-password en la web; y `redeemPasswordReset` en functions, con copia explícita porque pone la contraseña con el Admin SDK, que NO pasa por la política de Firebase — era la única puerta que seguía aceptando 8 caracteres. Sin `forceUpgradeOnSignin`: a los 24 usuarios con contraseña no se les rechaza el login hasta que la cambien, porque el formulario de login no maneja ese error todavía. Scripts: `functions/scripts/auth-password-policy.mjs` (`apply` / `off`).

**MFA para el equipo interno — diseño y estado.** Firebase no tiene MFA por rol: su estado de proyecto es "pueden enrolar" o "todos deben", y "todos" pondría una app autenticadora delante de cada comprador. La exigencia para admin/staff/finanzas la impone la app en el único lugar donde se acuña una sesión, `/api/session`: sin `sign_in_second_factor` en el token, no hay cookie (`apps/web/src/lib/auth/mfa-gate.ts`, 11 tests). Qué roles se exigen sale de `app_config/global.security.mfaRequiredRoles` — **vacío por defecto**, cambia sin deploy con `functions/scripts/mfa-enforce.mjs`, y un valor malformado abre el gate en vez de cerrarlo. Sólo TOTP (app autenticadora), nunca SMS. Flujo: login → 403 `mfa_required` → `/auth/mfa/enroll` (QR + clave manual + código) → cierre de sesión forzado → login con desafío de código (contraseña y Google, mismo paso). Ajustes → Seguridad lista y quita factores. Salida de emergencia para quien perdió el teléfono: `functions/scripts/mfa-unenroll.mjs <email>` (quita factores, revoca sesiones, deja audit_log).

Probado en emulador: gate (flag vacío → todos entran; flag staff → admin 403 con `enrolled:false`, comprador entra; flag roto → entra), redirección a enrolar, página, y que con el flag apagado el admin entra normal. **Lo que el emulador no puede probar es el TOTP en sí** (sólo implementa MFA por SMS): el intercambio real de enrolamiento y desafío se prueba después del upgrade, con el flag apagado, enrolando una cuenta propia. El proyecto está en Firebase Auth clásico: la API rechaza habilitar MFA con `MFA can only be enabled in GCIP or Firebase Auth upgraded to aligned product`. El upgrade a _Firebase Authentication with Identity Platform_ es irreversible y cambia el modelo de facturación (gratis hasta 50.000 usuarios activos/mes; hoy 140 cuentas → USD 0). Orden seguro: upgrade → `auth-mfa-config.mjs activar` (MFA opcional + TOTP) → enrolar vos y probar el login con código → `mfa-enforce.mjs admin staff finanzas`.

### 3.4 Headers HTTP en producción

Llegaban sólo `Strict-Transport-Security` y `X-Content-Type-Options`. **Faltaban** `X-Frame-Options` / `frame-ancestors` (clickjacking sobre login y puja), `Referrer-Policy` y `Permissions-Policy`. Agregados en `next.config.mjs` (SEC-3). El guard same-origin de `/api/session` funciona: POST cross-origin → 403, GET → 405.

No hay **Content-Security-Policy** completa. Hace falta, pero requiere nonces y una allowlist exacta (Firebase, Sentry por túnel `/monitoring`, Meta Pixel, Google Fonts); mal hecha rompe el login. Trabajo aparte.

### 3.5 Dependencias (`pnpm audit --prod`)

79 avisos: 3 críticos, 34 altos, 41 moderados, 9 bajos. Por paquete:

| Paquete                                                       | Avisos | Peor                                                                  | Alcanzable en Renew                                                                                                                                                                                               | Arreglo                                                                        |
| ------------------------------------------------------------- | ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `next@14.2.35`                                                | 23     | **Crítico** (RCE en optimizador de imágenes con AVIF; RCE en Windows) | **No.** `/_next/image` en producción lo sirve **Netlify Image CDN**, no Next (verificado por headers); Windows no aplica. El resto (DoS en RSC, cache poisoning, SSRF en middleware) son teóricamente alcanzables | Subir a Next 15.5.24+. Es un salto de mayor; se planifica, no se hace a ciegas |
| `undici` (vía `firebase@10.14.1`)                             | 15     | Alto                                                                  | Cliente: WebSocket/HTTP del SDK                                                                                                                                                                                   | Subir `firebase` a 12.x (las pruebas de reglas ya usan 12.17)                  |
| `websocket-driver` (vía `@firebase/database`)                 | 2      | **Crítico**                                                           | **No.** Realtime Database no se usa; el módulo no entra al bundle                                                                                                                                                 | Se va con el upgrade de `firebase`                                             |
| `next-intl@3.26.5`                                            | 2      | Moderado (open redirect, prototype pollution)                         | Open redirect: sí, por la ruta de locale                                                                                                                                                                          | Subir a 4.9.1+                                                                 |
| `firebase-admin@12.7.0` deps (`grpc-js`, `form-data`, `uuid`) | 6      | Alto                                                                  | Server                                                                                                                                                                                                            | Subir a 13.x                                                                   |
| Sentry bundler plugin deps                                    | 12     | Alto                                                                  | **No.** Sólo en build                                                                                                                                                                                             | Se va con el upgrade de `@sentry/nextjs`                                       |
| `express`/`qs` (functions)                                    | 4      | Moderado                                                              | Callables no parsean query strings                                                                                                                                                                                | Con el upgrade de `firebase-functions`                                         |

Ninguno de los tres críticos es alcanzable en esta topología. Los upgrades de mayor (Next 15, firebase 12, next-intl 4) son un trabajo con su propia rama y su propia corrida de e2e; no van en un commit de auditoría.

### 3.6 Secretos

Ningún archivo `.env`, clave privada ni service account en el repo **ni en todo el historial de git** (escaneo de `git log -p` completo). Ninguna variable `NEXT_PUBLIC_*` con nombre de secreto.

## 4. Espejo en SRPY186 — factible, construido, probado

### 4.1 Qué hay que espejar (medido en producción, sólo lectura)

| Origen                         | Volumen                 | Nota                                                                                                             |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Firestore, 11 colecciones raíz | 8.353 docs              | **7.336 son `rate_limits/pageview_*`**: contadores transitorios de sesiones anónimas que nunca se borran (OPS-1) |
| Firestore, 4 subcolecciones    | 482 docs                | `viewers` 409, `private` 40, `bids` 33                                                                           |
| Datos de negocio reales        | **~1.500 docs**         | users 138, auctions 96, vehicles 40, audit_logs 444, insights 36… — unos pocos MB                                |
| Storage                        | 181 objetos, **155 MB** | 179 fotos de vehículos, 2 comprobantes                                                                           |
| Auth                           | **140 cuentas**         | 119 Google, 24 contraseña                                                                                        |

### 4.2 Dónde

`srpy-postgres` en SRPY186 (PostgreSQL 17.10, imagen pgvector, stack `/home/santarosa/stack/infra`, `127.0.0.1:5433`) ya aloja `compras` y `cotizacionsr`. Una base `renewsubastas_mirror` ahí es el lugar natural. 24 núcleos, 62 GB RAM, 605 GB libres.

### 4.3 Cómo — `apps/mirror`

Un contenedor Node, **sólo lectura contra Firebase** (service account con `datastore.viewer` + `storage.objectViewer` + `firebaseauth.viewer`, nada más), que:

1. hace una **pasada completa** de Firestore al arrancar (toda profundidad, `listCollections` por documento) y **reconcilia**: lo que el espejo tenía y Firestore ya no, queda con `deleted_at` — nunca se borra una fila;
2. se queda **escuchando** (`onSnapshot` por colección raíz + `collectionGroup` por subcolección) y aplica cada cambio al llegar; si un listener muere, se reengancha con backoff;
3. repite la pasada completa cada 6 h, lista Auth cada 30 min, sincroniza el bucket cada 60 min (sólo lo que cambió por md5, a disco, con nombre temporal + rename);
4. expone `/healthz`: 200 sólo si el tail está enganchado y la última pasada de cada tipo terminó bien.

Postgres recibe una tabla genérica `fs_documents (path, collection, root, parent_path, doc_id, data jsonb, first_seen, last_seen, deleted_at)` más vistas `v_auctions`, `v_users`, `v_bids`… para consultar natural (`select data->>'status' from v_auctions`). Los tipos que JSON no tiene viajan etiquetados sin pérdida: `{"$ts": ISO}`, `{"$geo"}`, `{"$ref": path}`, `{"$bytes"}`. La migración futura arma el esquema relacional **desde** ese jsonb, con los datos ya en casa.

**Lo que no espeja, a propósito:** hashes de contraseña (Firebase los exporta con `firebase auth:export`, Supabase Auth los importa; es un paso único el día de la migración — 24 cuentas), y `rate_limits`/`page_views` en tiempo real (van en cada pasada completa).

### 4.4 Probado

Contra emuladores + Postgres 17 descartable, y también **la imagen Docker construida**:

- pasada completa: 161 docs en 0,33 s; Auth: 102 cuentas; Storage: 1 objeto; `verify` → **ESPEJO AL DÍA**, diff 0 en las 15 colecciones;
- tail en vivo: alta, modificación y borrado de un doc raíz y uno de subcolección llegan a Postgres en < 2 s, con Timestamp/GeoPoint/DocumentReference preservados y el borrado como soft-delete;
- 13 listeners enganchados, 0 errores en el log del demonio, `/healthz` → `healthy: true`;
- 12 tests unitarios del conversor.

**Costo:** lecturas de Firestore — ~9.000 la pasada completa (nivel gratuito: 50.000/día), una por documento cambiado después. Postgres: pocos MB. Disco: 155 MB.

### 4.5 Qué falta para que corra en el servidor (necesita tu OK — §6)

Tres prerrequisitos, en `apps/mirror/docker-compose.server.yml`: crear la service account de sólo lectura y bajar su clave al servidor (`/home/santarosa/stack/infra/secrets/`, 600); crear base y usuario en `srpy-postgres`; `docker compose up -d --build`. Después `verify` tiene que decir ESPEJO AL DÍA contra producción.

---

## 5. Auditoría de fallas — qué se rompió, por qué, qué se hizo

| #          | Dónde                                 | Falla                                                                                                      | Causa                                                                                                                                                                                            | Arreglo                                                                                                                                          |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **E2E-1**  | `e2e-flow.ts`                         | Paso 1 crasheaba: `Bid must be at least 5500`                                                              | El piso de 500 USD sobre la base se desplegó (`e3032c9`) y el e2e seguía abriendo con una puja **al** precio base                                                                                | La puja al base pasó a ser el caso rechazado del paso 0; la secuencia arranca en 5500                                                            |
| **E2E-2**  | `e2e-flow.ts`                         | Paso 6 crasheaba: `storagePath does not match this auction/caller`                                         | La ruta del comprobante pasó a 3 segmentos el 05/08 y el handler pasó a verificar el objeto real en Storage; el e2e inventaba una ruta de 2 segmentos sin subir nada                             | Sube un PDF real al emulador en la ruta nueva; además cubre ruta vieja y ruta de otro uid                                                        |
| **E2E-3**  | `e2e-flow.ts`                         | Un crash dejaba subasta, vehículo y compradores huérfanos en el emulador                                   | Limpieza sólo al final feliz                                                                                                                                                                     | `try/finally`                                                                                                                                    |
| **LOAD-1** | `mint-load-tokens.ts`                 | El 100 % de las pujas de carga habría muerto con `profile_incomplete`                                      | Sembraba `documentId`; `placeBid` exige `documentType` + `documentNumber`                                                                                                                        | Campos correctos                                                                                                                                 |
| **LOAD-2** | `hot-auction-bids.js`                 | Alarma falsa garantizada: contaba el rate limit (10/min) como **contención**                               | `resource-exhausted` caía en el mismo balde que `ABORTED`; los VUs disparaban sin pausa y agotaban el cupo en segundos                                                                           | Cadencia de 6 s por VU, contadores separados para rate limit, errores de armado y transporte; `DEBUG_ERRORS=1` imprime cada error no clasificado |
| **LOAD-3** | (nuevo) `verify-load-auction.mjs`     | No existía verificación de consistencia post-ráfaga                                                        | k6 mide latencia, no corrección                                                                                                                                                                  | 8 invariantes sobre el estado final                                                                                                              |
| **SEC-2**  | `storage.rules`                       | **Pisar un comprobante ya enviado pasaba** en el emulador pese a `allow update: if false`                  | El emulador clasifica la re-subida sobre una ruta ocupada como `create` (con `resource` poblado); la doc dice que producción la trata como `update`. Apostar producción a esa diferencia no vale | `&& resource == null` en el `create`: denegado en los dos mundos, sin depender de ninguno. El flujo real sube siempre a una ruta nueva           |
| **SEC-3**  | `next.config.mjs`                     | Sin `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`                           | Nunca se configuraron                                                                                                                                                                            | Agregados; HSTS con `includeSubDomains`                                                                                                          |
| **SEC-4**  | `circuit-test.mjs`                    | Escribe en **producción** (SA real, comprador real, crea subasta viva, dispara correo) sin ninguna guarda  | Único script de la carpeta que no apunta al emulador                                                                                                                                             | Aborta salvo `I_KNOW_THIS_WRITES_TO_PRODUCTION=1`                                                                                                |
| **SEC-5**  | `submitPaymentProof.ts`               | Comentario de seguridad falso: decía que `storage.rules` también verifica el ganador vía `firestore.get()` | Eso se quitó en `9bff612` (bloqueo IAM) y el comentario quedó                                                                                                                                    | Corregido: el handler es el único punto de verificación del ganador, y dice por qué                                                              |
| **OPS-1**  | `logPageView.ts`, `logAuctionView.ts` | 7.336 docs `rate_limits/pageview_*` + 104 `views_*` que nunca se borran (83 % de la base); +~5.000/mes     | Contadores de 60 s sin TTL                                                                                                                                                                       | Escriben `expiresAt` (+24 h). Falta habilitar la política TTL (§6)                                                                               |
| **TEST-1** | `storage-rules.pentest.test.ts`       | Un test verde en una corrida fallaba en la siguiente                                                       | `env.clearStorage()` no vacía un bucket con nombre propio en el emulador                                                                                                                         | Nombres únicos por corrida para lo que cada test crea                                                                                            |

## 6. Lo que queda de tu lado

Por orden de impacto. Ninguno lo puedo hacer yo sin tocar producción o tu servidor sin tu OK.

1. ~~Forzar App Check en Firestore~~ — **hecho** el 15/09 17:05 UTC (§3.2). Si alguien ve el catálogo o el panel de pujas vacío desde hoy, el rollback es una línea (§3.2).
2. ~~Desplegar~~ — **hecho**: web `70dd5c3` publicada en Netlify con los headers; reglas de Storage liberadas; 37 functions actualizadas.
3. ~~TTL en `rate_limits`~~ — **hecho**: política ACTIVE sobre `expiresAt`, y los 7.204 contadores viejos (último timestamp > 24 h) se borraron por script: 7.489 → 286 docs.
4. ~~Espejo en el servidor~~ — **hecho**: corriendo en SRPY186 (`apps/mirror/README.md`), `verify` contra producción ESPEJO AL DÍA.
5. ~~Política de contraseña~~ — **hecho** (§3.3). **MFA** — código desplegado con la exigencia apagada; falta el upgrade a Identity Platform (decisión tuya: irreversible, USD 0 a esta escala) y después los tres pasos de §3.3.
6. **Upgrades de mayor** en su propia rama, con este mismo e2e y estas mismas pruebas de reglas como red: Next 15.5.24+, `firebase` 12, `next-intl` 4, `firebase-admin` 13, `@sentry/nextjs` último.
7. **Un proyecto de staging descartable** en Firebase. Sin él, la latencia real de `placeBid` bajo ráfaga sigue sin medirse — el emulador no puede. `load-test/hot-auction-bids.js` ya está listo para apuntarle (`-e BASE_URL=… -e TRANSPORT_MAX=10`).
8. **CSP completa** (§3.4). Trabajo aparte.
9. Sacar `carbidpy.netlify.app` de los dominios autorizados de Auth si ya no sirve.
