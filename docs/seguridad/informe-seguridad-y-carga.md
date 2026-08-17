# Renew Subastas — informe de seguridad y carga

**Fecha:** 17 de agosto de 2026 · **Commit revisado:** `9bff612` (producción)

Dos trabajos distintos, con herramientas distintas:

- **Seguridad** — revisión manual del código + Strix (agente de pentesting)
  contra el código local. Nunca contra producción.
- **Carga** — análisis de arquitectura + script de k6 para el caso crítico.

---

## 1. Seguridad — revisión manual

La postura es **sólida**. El límite de seguridad real de una app Firebase son
las reglas (el cliente escribe la base directo) y las guardas de los callables,
y las dos cosas están bien.

### Lo que está bien

| Superficie             | Estado                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firestore.rules`      | Fail-closed. `users` sólo deja al cliente tocar `favorites` (allowlist de un campo); el resto es server-managed. Audiencia retail/mayorista re-chequeada en subcolecciones. Reserva y datos bancarios aislados en docs que el comprador no puede leer. Denegaciones explícitas. |
| `storage.rules`        | Corregidas hoy — ver §1.2. Cada comprador escribe sólo bajo su propio uid; lectura sólo staff/admin/finanzas.                                                                                                                                                                   |
| Callables que mutan    | **Todos** con `requireSignedIn` + chequeo de rol + `enforceAppCheck`. Verificado uno por uno (placeBid, buyNow, updateAuction, createAuction, deleteAuction, markSoldOffline, createUser, updateUserRole, etc.).                                                                |
| `requestPasswordReset` | Rate-limited (3/hora por email) y **no filtra si el email existe** (siempre `{ok:true}`).                                                                                                                                                                                       |
| Secretos               | Ninguno expuesto como `NEXT_PUBLIC`. Sin service account hardcodeado. Sentry borra `private_key`/tokens/cookies antes de enviar eventos.                                                                                                                                        |

### 1.2 Corregido hoy (`9bff612`)

La subida del comprobante de seña estaba **rota desde el 5 de agosto**. La
regla de Storage hacía un `firestore.get()` para verificar el ganador, y eso es
una llamada entre servicios que necesita un rol IAM que el proyecto no tiene;
fallaba y denegaba todo con `storage/unauthorized`. Costó una venta (la
adjudicación se liberó por falta de pago que en realidad no se pudo hacer). Se
sacó el `firestore.get()`; la protección la sostienen el segmento `uid` de la
ruta y la verificación de ganador que ya hace `submitPaymentProof`.

### Para verificar vos (consola / IAM — no se ve desde el código)

1. **App Check forzado** para Firestore y Storage en la consola. El código lo
   fuerza en los callables, pero el acceso directo del cliente a Firestore/
   Storage se activa con un toggle de consola aparte. Confirmá que esté **ON**;
   si no, un bot con la config pública del cliente puede pegarle a Firestore
   (las reglas igual lo frenan, pero App Check corta el ruido antes).
2. **`requestPasswordReset` sin App Check.** Riesgo bajo (rate-limited, sin
   enumeración), pero se le puede activar — un usuario bloqueado igual tiene
   token de App Check válido, así que no rompe el flujo de recuperación.
3. **Rol IAM para recuperar la verificación fuerte del comprobante.** Si querés
   volver a chequear el ganador dentro de la regla de Storage, primero
   concedele a
   `service-615909978578@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   el rol `roles/firebaserules.firestoreServiceAgent`, y recién ahí volvé a
   poner el `firestore.get()` (queda comentado en `storage.rules`).

### 1.3 Pentest ejecutable — 34 ataques contra las reglas reales

`functions/src/security/firestore-rules.pentest.test.ts` no es una revisión en
papel: son **34 ataques que corren de verdad** contra `firestore.rules`, en el
emulador y con un proyecto descartable. Cubren escalada de privilegios, IDOR,
bypass de segmentación retail/mayorista, manipulación del estado de la subasta,
fuga de datos sensibles, consultas de grupo de colección, cuentas suspendidas y
claims ausentes o inventados.

```bash
ENFORCE_APP_CHECK=false npx firebase-tools emulators:exec --only auth,firestore \
  --project carbid-test 'pnpm --filter @carbid/functions test -- pentest'
```

**Resultado: 34/34 en verde**, después de corregir el hallazgo de abajo.

#### Hallazgo — el default de audiencia no defaulteaba (corregido)

```
function audience() { return request.auth.token.audience != null ? ... : 'retail'; }
```

Ese `!= null` parecía defensivo y no lo era. En las reglas de Firestore, leer
una propiedad que **no existe** en el token no devuelve null: **aborta la
evaluación con error**, y una regla que aborta deniega. O sea que el comprador
antiguo al que ese default decía proteger era exactamente el que quedaba
afuera: sin el claim `audience` no podía leer **ni una subasta ni un vehículo**
— catálogo vacío, sin ningún error que lo explicara.

Corregido con `request.auth.token.get('audience', 'retail')`, que es el
accesor con default de verdad. La prueba que lo cubre queda en la suite.

**Alcance en producción: 0 compradores afectados hoy.** Se auditaron las 75
cuentas del proyecto: los 66 compradores tienen el claim. Era una mina
enterrada, no un incendio — pero cualquier alta futura cuyo claim se escribiera
a medias caía en un catálogo vacío sin diagnóstico posible.

_(Aparte: la cuenta `thevoro85@gmail.com` no tiene ningún claim, así que no
puede acceder a nada. Probablemente un alta con Google que quedó por la mitad.)_

### 1.4 Strix

Instalado (v1.5.3, vía `uv`; Docker corriendo). **No se ejecutó**: es un agente
de IA y necesita una API key de LLM que no está en este entorno. El pentest de
§1.3 cubre el mismo terreno de forma determinista y sin costo por corrida.

Si querés correrlo igual, apunta al código local con tope de gasto:

```bash
export STRIX_LLM="openai/gpt-5"   # el modelo que uses
export LLM_API_KEY="sk-..."       # tu key del proveedor
bash docs/seguridad/strix-local.sh
```

---

## 2. Carga — ¿aguanta 100 simultáneos?

**100 personas navegando: sí, sin problema.** Firestore escala lecturas y el
front lo sirve la CDN de Netlify.

El cuello de botella es otro y es puntual: **muchas pujas sobre LA MISMA
subasta al mismo tiempo.** `placeBid` ([placeBid.ts:107](../../functions/src/auctions/placeBid.ts))
corre una transacción sobre el documento de la subasta, y Firestore sostiene
**~1 escritura/segundo por documento**. Bajo una ráfaga (cierre de una subasta
codiciada), las transacciones compiten por ese doc, reintentan y la latencia
sube. No es "100 usuarios", es "100 pujas al mismo auto en el mismo segundo".

### Cómo medirlo (script listo, correr contra staging)

`load-test/hot-auction-bids.js` simula 100 pujadores concurrentes sobre una
subasta y separa los rechazos sanos ("quedó baja") de la señal de estrés
(abortos por contención). Ver la cabecera del archivo para correrlo.

### Recomendaciones

- **`maxInstances: 20` en `placeBid` — hecho.** Sin tope, una ráfaga levantaba
  decenas de instancias compitiendo por el mismo documento: más reintentos, más
  latencia y más pujas abortadas que con menos manos en el plato. No es un
  número apretado — las funciones de 2ª generación atienden 80 pedidos
  concurrentes por instancia, así que deja lugar a ~1600 pujas en vuelo.
- **El anti-sniping ya ayuda:** extiende el cierre cuando entra una puja sobre
  la hora, lo que naturalmente dispersa la ráfaga final.
- Si la contención resulta real en la medición, el paso siguiente es un patrón
  anti-contención (aceptar-y-reconciliar, o una cola de pujas). No lo toques
  antes de medir: una subasta tiene un solo ganador a la vez, así que algo de
  serialización es correcto; lo que importa es la latencia bajo ráfaga.
