# @carbid/mirror — espejo de Firebase en el servidor

Copia continua de **todo lo que Renew Subastas guarda en Firebase** hacia
PostgreSQL en SRPY186, para tener la base fuera de Google desde hoy y poder
migrar más adelante sin una exportación de último momento.

| Qué                           | De dónde                                     | A dónde                                         | Cómo                                                               |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Documentos (toda profundidad) | Firestore, 11 colecciones + 4 subcolecciones | `fs_documents` (jsonb) + vistas `v_<colección>` | Pasada completa al arrancar, tail en vivo, reconciliación cada 6 h |
| Cuentas                       | Firebase Auth (`listUsers`)                  | `auth_users`                                    | Cada 30 min                                                        |
| Archivos                      | bucket `carbid-staging.firebasestorage.app`  | `/data/storage/<bucket>/…` + `storage_objects`  | Cada 60 min, sólo lo que cambió (md5)                              |
| Bitácora                      | —                                            | `mirror_runs`                                   | Una fila por pasada, con `ok` y duración                           |

**Sólo lectura contra Firebase.** La service account del servidor tiene los
roles `datastore.viewer`, `storage.objectViewer` y `firebaseauth.viewer` y
nada más: ni por bug ni por compromiso del servidor puede escribir en
producción.

## Cómo se ve del lado de Postgres

```sql
select doc_id, data->>'status', (data->>'currentBid')::numeric from v_auctions;
select data->>'email' from v_users where data->>'role' = 'buyer';
select * from v_bids where parent_path = 'auctions/WKRwtPAVYUUUp0n6SMpN';
select email, providers, custom_claims->>'role' from auth_users;
select kind, ok, rows_seen, finished_at - started_at from mirror_runs order by id desc;
```

Los tipos que JSON no tiene viajan etiquetados (ver `src/convert.ts`):
`{"$ts": "2026-09-15T14:00:00.000Z"}` para Timestamp, `{"$geo": …}`,
`{"$ref": "auctions/abc"}`, `{"$bytes": "<base64>"}`. Un documento que
desaparece de Firestore queda con `deleted_at` seteado — nunca se borra la
fila: el espejo existe para no perder datos, no para imitar borrados.

## Correr local (emuladores + Postgres descartable)

```bash
docker run -d --rm --name renew-mirror-pg -e POSTGRES_USER=mirror -e POSTGRES_PASSWORD=mirror \
  -e POSTGRES_DB=renew_mirror -p 127.0.0.1:5439:5432 postgres:17-alpine

export MIRROR_DATABASE_URL=postgres://mirror:mirror@127.0.0.1:5439/renew_mirror
export MIRROR_PROJECT_ID=carbid-staging MIRROR_STORAGE_BUCKET=carbid-staging.appspot.com
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
       FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199

pnpm --filter @carbid/mirror sync:full     # pasada completa
pnpm --filter @carbid/mirror verify        # cuenta Firestore vs espejo → "ESPEJO AL DÍA"
pnpm --filter @carbid/mirror dev           # demonio: tail + auth + storage + /healthz en :8787
```

`verify` es el comando para después de cualquier duda: cuenta documentos por
colección de los dos lados con `count()` (un puñado de lecturas, no un scan)
y sale con 1 si hay desfase en una colección con tail.

## Desplegar en SRPY186

Un comando desde esta máquina, con `ssh srpy-servidor` configurado:

```bash
# primera vez: clave de la SA de sólo lectura + base + .env + imagen + up
FIRST_RUN=1 SA_KEY=/ruta/renew-mirror-sa.json bash apps/mirror/deploy-to-srpy186.sh

# actualizaciones: sólo imagen + reinicio (clave, base y .env se conservan)
bash apps/mirror/deploy-to-srpy186.sh
```

El script construye la imagen acá y la carga por ssh (`docker save | docker
load`): el servidor no necesita credenciales del repo. Todo queda en
`/home/santarosa/stack/renew-mirror/` — `docker-compose.yml`, `.env` (600),
`secrets/renew-mirror-sa.json` (600) y `storage/` con las fotos, en bind
mount para que los backups del servidor las vean. Al final espera `/healthz`
y corre `verify`.

`/healthz` devuelve 200 sólo si el tail está enganchado y la última pasada de
cada tipo terminó bien; si no, 503 con el motivo en el JSON. Apuntarle el
health check de Beszel/Netdata del stack de monitoreo.

## Lo que NO espeja, a propósito

- **Hashes de contraseña.** Firebase los exporta (`firebase auth:export
--format=json`, scrypt con los parámetros del proyecto) y Supabase Auth los
  importa en ese formato, así que la migración es posible — pero es un paso
  único, a mano, el día de la migración. 24 cuentas con contraseña; las 119 de
  Google no tienen hash.
- **Reglas, índices, functions.** Viven en este repo (`firestore.rules`,
  `firestore.indexes.json`, `functions/`), no en la base.
- **`rate_limits` y `page_views` en tiempo real.** Se copian en cada pasada
  completa (la copia queda entera), pero no tienen listener: cambian en cada
  vista de página y no llevan nada que valga un tail.

## Costo

Firestore cobra lecturas: la pasada completa son ~9.000 hoy (el nivel gratuito
es 50.000/día), el tail una por documento cambiado. Postgres: la base entera
son unos pocos MB. Storage: 155 MB en disco, que crecen con las fotos.
