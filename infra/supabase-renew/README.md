# Supabase de pruebas de Renew Subastas (SRPY186)

Copia **de pruebas** de toda la base de producción en un Supabase autoalojado. No reemplaza a
producción (Firebase + Netlify). Diseño: `docs/superpowers/specs/2026-09-26-servidor-propio-design.md`.

## Orden

```bash
bash infra/supabase-renew/deploy-to-srpy186.sh   # stack supabase-renew (una vez; idempotente)
bash infra/supabase-renew/load-from-mirror.sh    # tablas, desde el espejo (RESET=1 = copia exacta)
bash infra/supabase-renew/import-auth.sh         # cuentas de Firebase Auth, con sus contraseñas
bash infra/supabase-renew/copy-storage.sh        # fotos y comprobantes
```

Para ponerla al día con producción: `load-from-mirror.sh`, `import-auth.sh` y `copy-storage.sh`
de nuevo (todos son repetibles).

## Qué hay (26/9/2026)

| Parte           | Contenido                                                                      |
| --------------- | ------------------------------------------------------------------------------ |
| Tablas (public) | 170 perfiles, 40 vehículos, 118 subastas, 34 pujas, 490 vistas, 524 auditorías |
| Cuentas (auth)  | 173; 27 con contraseña (hash de Firebase, verificado), 149 con Google          |
| Storage         | `vehicles` 179 archivos (público), `payment-proofs` 2 (privado)                |

## Seguridad

- Tiene **datos personales reales**. Todo escucha en `127.0.0.1` del servidor; nada está
  publicado. Los nombres `subastas.santarosa.lat` / `api-subastas.santarosa.lat` se agregan al
  túnel recién con la web de prueba y con Cloudflare Access cubriéndolos.
- RLS activado en todas las tablas, sin políticas, y sin permisos para `anon`/`authenticated`:
  solo `service_role` lee. Las políticas que reproducen `firestore.rules` llegan con la web.
- Claves de este stack en la notebook: `~/keys/supabase-renew.env` (600). En el servidor:
  `/home/santarosa/stack/supabase-renew/.env` (600).

## Mirar la base

```bash
ssh -L 8111:127.0.0.1:8111 srpy-servidor
```

Y abrir `http://localhost:8111` (Studio). O Postgres directo por el pooler:
`ssh -L 6549:127.0.0.1:6549 srpy-servidor`.

## Detalles que importan

- IDs: UUID deterministas derivados del id de Firebase (`legacy.id()`, `legacy.uid()`), así la
  carga es repetible y `auth.users.id` = `public.profiles.id`.
- Contraseñas: GoTrue 2.189 verifica el formato `$fbscrypt$v=1,n=,r=,p=,ss=,sk=$salt$hash`.
- 57 subastas viejas tenían la reserva en el documento padre (antes de `private/internal`): la
  carga la toma de ahí si falta el subdocumento.
- Cuentas borradas en Firebase: las referencias quedan en `null` pero se conserva el uid de
  Firebase (`bids.bidder_firebase_uid`, `auctions.winner_firebase_uid`).
