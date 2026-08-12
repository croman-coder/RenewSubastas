# Entorno de demo para grabar videos

Una copia completa de Renew Subastas, con usuarios y subastas de mentira, que
corre en tu máquina. Sirve para grabar el flujo entero —registro, puja, Compra
ya, adjudicación, pago— sin tocar nada real.

## Por qué esto y no una "cuenta de prueba" en producción

La separación es física, no un `if`. La base de datos es otra base de datos:

|                     | Producción  | Este entorno                               |
| ------------------- | ----------- | ------------------------------------------ |
| Subastas reales     | sí          | **no las ve siquiera**                     |
| Correos             | Resend real | clave falsa, no sale nada                  |
| Notificaciones push | sí          | no hay tokens, no se envía nada            |
| Píxel de Meta       | mide        | mide también — ver la advertencia al final |
| Datos al cerrar     | persisten   | se borran cuando querés                    |

Una cuenta marcada como "de prueba" dentro de producción queda a un `if` mal
escrito de mandarle un correo a un comprador real por un auto que no existe.
Acá eso no puede pasar: el correo no tiene a dónde salir.

## Levantarlo (3 comandos)

En una terminal, desde la raíz del repo:

```bash
pnpm emulators
```

Esperá a que diga `All emulators ready`. En otra terminal:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm --filter @carbid/functions exec tsx scripts/seed-demo-video.ts
```

Y en una tercera:

```bash
pnpm dev:web
```

El sitio queda en **http://localhost:3100**.

> Si es la primera vez: creá `functions/.secret.local` con la línea
> `RESEND_API_KEY=dummy-local-key`. Sin ese archivo los emuladores toman la
> clave real de producción y **sí mandan correos de verdad**. Ya pasó una vez.

## Los usuarios

Todos con la contraseña **`Demo123456`**.

| Correo                      | Rol                 | Para qué sirve en el video                        |
| --------------------------- | ------------------- | ------------------------------------------------- |
| `demo.admin@renew.test`     | Admin               | Panel completo: usuarios, configuración, finanzas |
| `demo.staff@renew.test`     | Staff               | Cargar vehículos y subastas, marcar VENDIDO       |
| `demo.comprador@renew.test` | Comprador retail    | **La protagonista (Carla)**: puja, gana, paga     |
| `demo.rival@renew.test`     | Comprador retail    | El otro postor, para mostrar "te superaron"       |
| `demo.mayorista@renew.test` | Comprador mayorista | Catálogo mayorista (no ve las subastas retail)    |

## Las subastas que ya están armadas

No hay que esperar a ningún cierre programado: cada estado ya existe.

| Id               | Vehículo               | Estado                                             |
| ---------------- | ---------------------- | -------------------------------------------------- |
| `demo-auction-0` | Toyota Corolla 2021    | Programada, arranca en 2 h                         |
| `demo-auction-1` | Honda Civic 2020       | En vivo, sin pujas — para grabar la primera puja   |
| `demo-auction-2` | Volkswagen Amarok 2019 | En vivo con **Compra ya** en USD 21.000            |
| `demo-auction-3` | Tesla Model 3 2022     | En vivo con 3 pujas, Carla va ganando              |
| `demo-auction-4` | Ford Ranger            | **Adjudicada a Carla** — pantalla de ganada y seña |
| `demo-auction-5` | Fiat Cronos            | Cerrada sin alcanzar la reserva                    |

Las que están en vivo cierran recién en 5–6 horas: el reloj nunca se te va a
terminar en medio de una toma, pero en pantalla sigue leyéndose urgente.

## Guion sugerido

1. **Sin sesión** — home pública, catálogo, "Iniciar sesión para pujar".
2. **Registro** — creá una cuenta nueva con cualquier correo `@renew.test`. El
   enlace de verificación no llega por mail; sacalo de
   http://127.0.0.1:4000/auth (pestaña Authentication del panel de emuladores).
3. **Primera puja** — entrá como Carla, abrí el Honda Civic, pujá.
4. **Te superaron** — en otra ventana privada entrá como Rodrigo y pujá más
   alto sobre el Tesla. Volvé a la ventana de Carla: el precio se actualiza
   solo, sin recargar.
5. **Compra ya** — Amarok, "Comprar ahora", confirmá. La subasta se cierra en
   el acto y aparece VENDIDO.
6. **Ganaste** — Ford Ranger desde la cuenta de Carla: pantalla de adjudicación
   y carga del comprobante de seña.
7. **Lado staff** — entrá como Sergio: crear una subasta, editarla, marcar una
   unidad como vendida en salón.
8. **Lado admin** — entrá como Ana: usuarios, filtro Retail/Mayorista,
   configuración, tablero de tráfico.

## Volver a empezar

Correr el seed de nuevo pisa las mismas subastas con los mismos ids, así que
sirve para reiniciar entre tomas sin duplicar nada en el catálogo:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm --filter @carbid/functions exec tsx scripts/seed-demo-video.ts
```

Para borrar todo de raíz, cerrá los emuladores y borrá la carpeta
`.emulator-data`.

Si necesitás adjudicar cualquier otra subasta a un comprador (para grabar la
pantalla de ganada con otro auto):

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm --filter @carbid/functions exec tsx scripts/close-as-sold.ts <auctionId> <uidDelComprador> <precio>
```

## Lo único que sí sale de tu máquina

El píxel de Meta corre igual en localhost, así que las vistas y las pujas del
video se cuentan como eventos reales en el píxel `1864069597698281`. Para una
grabación corta es ruido despreciable; si vas a grabar durante horas o repetir
muchas tomas, bloqueá `connect.facebook.net` en el navegador que uses para
grabar y listo.
