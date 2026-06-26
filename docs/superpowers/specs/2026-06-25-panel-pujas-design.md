# Panel de Pujas (admin + staff) — Diseño

Fecha: 2026-06-25
Estado: aprobado para escribir plan de implementación

## 1. Problema / objetivo

Hoy admin y staff **no pueden ver el comportamiento de las pujas**: quién está
pujando, con qué montos, ni el patrón entre subastas. Lo único disponible es:

- El detalle de una subasta muestra sus pujas pero **anonimizadas**
  (`buyerSnapshot` = nombre + inicial, p. ej. "Juan P.").
- La campanita muestra las últimas 10 pujas (también anonimizadas).
- El Inicio tiene un gráfico agregado de "pujas por día".

Falta una vista dedicada que muestre, con identidad real, la actividad de pujas
en vivo e histórica, con drill-down por pujador y por subasta, y visibilidad de
si los avisos por email a los pujadores efectivamente se enviaron.

Objetivos declarados por el usuario (los cuatro): monitoreo/transparencia,
detección de comportamientos raros, seguimiento comercial, y analítica/KPIs.

## 2. Alcance

Se construye **por fases**.

### v1 (este spec) — núcleo + tracking de envío de emails

Incluye:

- Página dedicada **Pujas** accesible por **admin y staff**.
- Tira de métricas, filtros, y tabla de actividad de pujas (en vivo + histórica).
- Identidad real del pujador (nombre completo) + **contacto (email/teléfono) a un
  clic**.
- Drill-down **por pujador** (su historial entre subastas) y **por subasta**
  (escalera completa de pujas, que también mejora el detalle de subasta actual).
- **Tracking de envío de emails** (nivel "Envío"): registrar el resultado de cada
  aviso transaccional (`enviado` / `omitido` / `falló` + id de Resend) y mostrarlo
  en el panel, más una tarjeta/filtro de "avisos fallidos".

### Fuera de alcance de v1 (fases futuras)

- **v2 — Alertas de patrones**: marcar comportamientos sospechosos (muchas pujas
  en poco tiempo, un pujador dominando varias subastas, pujas de último segundo).
  El diseño deja el lugar visual (badge ⚠) preparado, pero la lógica de detección
  es v2.
- **v3 — Analítica/KPIs**: top pujadores, promedio de pujas por subasta, qué autos
  generan más puja, actividad por día/hora, exportación.
- **Entrega real por webhooks de Resend** (entregado/rebotó/abierto): es el nivel
  "Entrega real", descartado para v1; se queda en "Envío".

## 3. Acceso y ubicación

- **Roles**: admin y staff. **No** finanzas, **no** buyer.
- **Ruta**: `apps/web/src/app/[locale]/(protected)/staff/bids/` → URL
  `/{locale}/staff/bids`.
  - Se ubica bajo el grupo `/staff` porque su layout ya admite
    `['admin','staff','finanzas']` y los admin ya reusan rutas `/staff/*`.
  - La página agrega un gate propio `requireRole(locale, ['admin','staff'])` para
    **excluir finanzas** (consistente con que finanzas no ve PII de pujadores).
- **Navegación** (`apps/web/src/components/shell/nav-config.ts`): nuevo ítem
  **"Pujas"** con icono `gavel` en el menú de **admin** (entre "Subastas" y
  "Ventas") y en el de **staff** (después de "Subastas").

## 4. UI / componentes

Página = shell server-rendered (`page.tsx`, gate de rol) + componente cliente
`BidsActivity` (live + filtros), siguiendo el patrón de `sales-table.tsx` y
`notification-bell.tsx`.

### 4.1 Tira de métricas (cards)

- **Pujas hoy** (conteo).
- **Pujadores activos hoy** (uids distintos que pujaron hoy).
- **Subasta más caliente** (la de más pujas en el rango).
- **Avisos fallidos** (cantidad de notificaciones con estado `falló` en el rango;
  card en tono de alerta; clic = filtra la tabla a esos casos).

En v1 estas métricas se derivan del conjunto cargado en la tabla (sin
agregaciones server pesadas; la analítica real es v3).

### 4.2 Filtros

- Por **subasta** (selector).
- Por **pujador** (búsqueda por nombre).
- Por **rango de fecha**: hoy / 7d / 30d / todo.
- Toggle **"En vivo"**: cuando está activo, `onSnapshot` agrega las pujas nuevas
  en tiempo real.

### 4.3 Tabla de actividad

Columnas: `Cuándo · Pujador · Monto · Auto (subasta) · Estado · Aviso`.

- **Estado** de la puja:
  - Subasta viva: `Ganando` (es la puja más alta actual de esa subasta) /
    `Superado`.
  - Subasta cerrada: `Ganó` / `No ganó`.
- **Aviso** (columna nueva del tracking de email): para la puja que **tomó la
  punta**, muestra el estado del email _"te superaron"_ enviado al pujador
  desplazado → `✓ enviado` / `– omitido` / `⚠ falló` (con tooltip del motivo;
  "omitido" = sin email o con el aviso desactivado en sus preferencias). Pujas que
  no desplazaron a nadie no muestran aviso.
- **Clic en la fila** → expande y muestra **email + teléfono** del pujador
  (resueltos vía `resolveBidders`) + acceso a "su historial".
- Orden por fecha desc; paginado/limit razonable (p. ej. 100) en histórico.

### 4.4 Drill-down por pujador

Ficha en ruta propia `/staff/bids/bidder/[uid]` (deep-linkable): nombre + contacto,
total de pujas, en cuántas subastas participó, monto máximo, cuántas ganó/perdió, y una
**línea de tiempo de avisos** (te superaron / ganaste, con estado y fecha leídos
de `notifications`).

### 4.5 Drill-down por subasta

La **escalera de pujas** de una subasta (secuencia completa: quién subió a quién,
montos, tiempos), con identidad real. Reutilizable para enriquecer el detalle de
subasta existente (`staff/auctions/[id]`), que hoy muestra solo nombre+inicial.

## 5. Datos y arquitectura

### 5.1 Lectura de pujas

- Fuente: `collectionGroup('bids')` ordenado por `createdAt desc`.
- Filtro por pujador: `where('buyerUid','==',uid)` + `orderBy('createdAt','desc')`.
- Filtro por subasta: subcolección `auctions/{id}/bids` ordenada por `amount desc`
  (escalera) o `createdAt`.
- **Índices**: los necesarios ya existen en `firestore.indexes.json`
  (collection-group `bids` por `createdAt`, por `buyerUid`+`createdAt`, y
  `auctionId`+`amount`). Confirmar en el plan; agregar solo si falta alguno.
- La tabla es cliente y usa el SDK de Firestore (`onSnapshot` para "en vivo",
  `getDocs` para histórico/filtros). La regla collection-group de `bids` ya
  permite lectura a `isAdmin() || isStaff() || isFinanzas()` (endurecida en la
  auditoría previa), así que admin/staff pueden leer.

### 5.2 Identidad + contacto: `resolveBidders` (Cloud Function)

- Nuevo callable `resolveBidders({ uids: string[] })`.
- Autorización: **solo admin o staff** (`requireSignedIn` + check de rol).
- Devuelve `{ [uid]: { displayName, email, phone } }` — **solo** esos 3 campos.
- Límite de tamaño del lote (p. ej. ≤ 50 uids por llamada) y validación de input.
- El cliente cachea por uid (como `sales-table`); nunca lee la colección `users`
  en masa. Consistente con `getWinnerContact`.
- Reglas: la lectura directa de `users` sigue siendo admin-only; staff obtiene
  contacto de pujadores **solo** vía este callable.

### 5.3 Tracking de envío de emails

Cambios de backend:

1. **`functions/src/lib/email.ts`**: `sendEmail` pasa a **devolver** un resultado
   estructurado en vez de `void`:
   `{ status: 'sent' | 'skipped' | 'failed', resendId?: string, reason?: string }`.
   - `skipped` cuando no hay API key (caso actual de no-op).
   - `failed` cuando Resend rechaza o la llamada lanza (hoy ya se loguea; ahora
     también se devuelve).
   - Compatibilidad: los llamadores que ignoran el retorno siguen funcionando.
2. **Nuevo helper** `recordNotification(...)` (p. ej. `functions/src/lib/notify.ts`)
   que escribe un documento en la colección **`notifications`**:
   `{ type: 'bid_outbid' | 'auction_won', toUid, toEmail, auctionId, bidId?, status, reason?, resendId?, createdAt }`.
3. **Senders** `sendBidOutbid` y `sendAuctionWon`: tras llamar a `sendEmail`,
   registran el resultado vía `recordNotification` con el contexto completo.
   - En `sendBidOutbid`, `bidId` = la puja que disparó el aviso; `toUid` =
     `displacedBuyerUid`.
   - El caso "omitido por preferencia/sin email" también se registra
     (`status: 'skipped'`, `reason: 'pref_off' | 'no_email'`) para que el panel
     muestre "– omitido" en vez de un hueco.
4. **Colección `notifications`**: solo la escribe el servidor (Admin SDK). Regla
   Firestore: `allow read: if isAdmin() || isStaff(); allow write: if false;`.
5. **Índice** para `notifications`: por `createdAt desc` y para filtrar
   `status == 'failed'` (compuesto `status`+`createdAt`), y por `toUid`+`createdAt`
   para la línea de tiempo del pujador.

### 5.4 Lectura del estado de aviso en el panel

- La tabla cruza cada puja-que-tomó-la-punta con el registro de `notifications`
  correspondiente (`bidId`) para pintar la columna "Aviso".
- La tarjeta "Avisos fallidos" cuenta `notifications` con `status == 'failed'` en
  el rango.

## 6. Seguridad

- Página y callable: admin + staff únicamente (finanzas y buyer excluidos).
- `resolveBidders` devuelve solo nombre/email/teléfono; no expone otros campos de
  `users` (documento, dirección, fcmTokens, etc.).
- `notifications`: lectura admin/staff, escritura solo servidor.
- No se relaja ninguna regla existente; se reusa el endurecimiento de la auditoría
  previa (bids collection-group ya limitado a roles internos).

## 7. Estados y edge cases

- Pujador sin email / con aviso desactivado → fila de aviso "– omitido" con motivo.
- Puja que no desplaza a nadie (primera puja de la subasta) → sin columna "Aviso".
- Subasta cancelada → las pujas se muestran con estado neutro ("Subasta cancelada").
- `resolveBidders` con un uid inexistente → ese uid se omite del resultado; el
  panel cae al nombre del `buyerSnapshot` o al uid.
- Datos legacy: pujas viejas sin `displacedBuyerUid`/`displacedAmount` → no se
  intenta pintar "Aviso" (solo aplica a pujas nuevas).
- "En vivo" en subastas con mucha actividad → limit en la suscripción para no
  inundar (p. ej. últimas 100).

## 8. Testing

- `resolveBidders`: rechaza buyer/finanzas (permission-denied); admin y staff OK;
  devuelve exactamente `{displayName,email,phone}`; respeta el límite de lote.
- `sendEmail`: devuelve `sent` (con resendId mock), `skipped` (sin key), `failed`
  (Resend rechaza / lanza).
- `recordNotification` / senders: crean el doc en `notifications` con el estado
  correcto para los casos enviado / omitido (pref off, sin email) / falló.
- Reglas: admin/staff leen `notifications` y `bids` (collection-group); buyer no;
  nadie escribe `notifications` desde cliente.
- (UI) la tabla mapea estado de puja y de aviso correctamente; los filtros
  arman los queries esperados.

## 9. Trabajo aproximado (orientativo, no compromiso)

- Backend: `resolveBidders` (nuevo), cambios en `email.ts`, `recordNotification`,
  edición de 2 senders, 1 regla + índices.
- Frontend: 1 ruta + layout/gate, componente `BidsActivity` (tabla live+filtros),
  2 drill-downs, ítem de nav (×2 roles), strings i18n.
