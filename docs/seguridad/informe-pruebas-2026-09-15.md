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

### 3.2 App Check — la respuesta que faltaba

Leído por API (no por consola):

| Servicio               | Estado         |
| ---------------------- | -------------- |
| Storage                | **ENFORCED**   |
| **Firestore**          | **UNENFORCED** |
| Auth (identitytoolkit) | UNENFORCED     |

Firestore es la base que el cliente escribe directo. Las reglas lo protegen igual (§3.1), pero sin App Check cualquier script con la config pública puede hablarle a Firestore como si fuera la app — leer el catálogo entero como comprador, hacer ruido. Proveedores reCAPTCHA v3 y Enterprise están configurados en la app web, así que el cliente **ya manda** el token. → SEC-1 en §6, con el procedimiento para forzarlo sin dejar a nadie afuera.

### 3.3 Auth

| Control                    | Estado                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Anti-enumeración de emails | **ON** ✓                                                                                            |
| Dominios autorizados       | localhost, `*.firebaseapp.com`, `*.web.app`, `carbidpy.netlify.app` (viejo), `renewsubastas.com.py` |
| MFA                        | Desactivada — recomendable para admin/staff/finanzas                                                |
| Política de contraseña     | Ninguna del lado del servidor                                                                       |
| Funciones de bloqueo       | Ninguna                                                                                             |

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

1. **Forzar App Check en Firestore** (SEC-1). Antes de tocar el toggle: Firebase Console → App Check → Firestore → pestaña de métricas. Si ~100 % de los pedidos de los últimos 7 días llegan con token válido, pasá a **Enforce**; si hay un porcentaje sin token, ese porcentaje son usuarios que van a ver el catálogo vacío — hay que entender quiénes son primero (¿el wrapper iOS dormido? ¿navegadores viejos con reCAPTCHA bloqueado?). Auth (identitytoolkit) puede quedar sin forzar: bloquearía el login de quien no pase reCAPTCHA.
2. **Desplegar** lo de este commit: `git push origin main` (web: headers) + `firebase deploy --only storage,functions --project carbid-staging` (regla `resource == null` + `expiresAt`). Reglas primero, web después — y el orden acá no importa porque nada cambia el contrato cliente↔reglas.
3. **Habilitar TTL** en `rate_limits` después de desplegar functions (para que el campo exista):
   ```bash
   gcloud firestore fields ttls update expiresAt --collection-group=rate_limits --enable-ttl --project=carbid-staging
   ```
   Los 7.336 docs viejos no tienen `expiresAt` y no se van solos; se borran una vez con un script, o se dejan (son 300 KB).
4. **Espejo en el servidor** (§4.5): decime si arranco. Necesito crear la service account de sólo lectura en GCP (con la SA owner que ya tengo), la base en `srpy-postgres` y levantar el compose. Media hora, reversible, sin tocar la app.
5. **Política de contraseña** en Auth (largo mínimo, mayúscula, número) y **MFA para admin/staff/finanzas**. Console → Authentication → Settings. Bajo riesgo.
6. **Upgrades de mayor** en su propia rama, con este mismo e2e y estas mismas pruebas de reglas como red: Next 15.5.24+, `firebase` 12, `next-intl` 4, `firebase-admin` 13, `@sentry/nextjs` último.
7. **Un proyecto de staging descartable** en Firebase. Sin él, la latencia real de `placeBid` bajo ráfaga sigue sin medirse — el emulador no puede. `load-test/hot-auction-bids.js` ya está listo para apuntarle (`-e BASE_URL=… -e TRANSPORT_MAX=10`).
8. **CSP completa** (§3.4). Trabajo aparte.
9. Sacar `carbidpy.netlify.app` de los dominios autorizados de Auth si ya no sirve.
