# Reporte de remates (insights) para admin/staff — Design

- **Fecha:** 2026-07-21
- **Estado:** Aprobado (brainstorming) — pendiente plan de implementación
- **Autor:** equipo Renew + Claude
- **Rama:** `feat/auction-insights`
- **Origen:** pedido del dueño (WhatsApp): "un reporte donde podamos ver los que
  entran a ver y los movimientos del precio que tuvo — por ejemplo las veces que
  se bajó el precio — y que nos tire una alerta si en 7 días no se vendió".

## 1. Objetivo

Dar a **admin y staff** (misma visibilidad para ambos) un reporte por vehículo
con tres insights:

1. **Quién entra a ver** cada remate (compradores identificados + conteos).
2. **Movimientos de precio** (historial de cambios, destacando bajadas).
3. **Alerta de 7 días sin vender** (email resumen + badge permanente).

### Decisiones del brainstorming

| Tema                                | Decisión                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definición "no se vendió en 7 días" | Vehículo cuya **primera publicación** (primera subasta creada) fue hace ≥7 días y ninguna subasta suya terminó `sold`. Cubre re-listados.                                                            |
| Nivel de tracking de vistas         | Compradores logueados con nombre + contadores. Anónimos NO existen hoy (el detalle del remate está en el grupo `(protected)`); si el catálogo se hace público algún día, se agrega contador anónimo. |
| Canal de la alerta                  | **Un email resumen diario** a admin+staff (solo vehículos que cruzan el umbral por primera vez) + **badge rojo permanente** en el reporte. Sin push (bug VAPID pendiente, y evita spam).             |
| Visibilidad                         | Admin y staff ven exactamente lo mismo. Nada solo-admin en v1.                                                                                                                                       |
| Vistas de admin/staff               | **No se registran** — solo interesa demanda real de compradores.                                                                                                                                     |

### Fuera de alcance (YAGNI v1)

- Contadores de visitantes anónimos (no existen: detalle requiere login).
- Export CSV, gráficos/charts, configurabilidad del umbral (7 días fijo).
- Alertas push FCM.
- Backfill histórico de precios/vistas (los datos arrancan desde el deploy;
  audit_logs viejos quedan como referencia manual).

## 2. Datos nuevos (Firestore)

```
auctions/{auctionId}/viewers/{uid}
  uid            string
  firstName      string        // snapshot al momento de la primera vista
  lastInitial    string        // "P." — mismo formato que buyerSnapshot de placeBid
  firstViewAt    Timestamp
  lastViewAt     Timestamp
  viewCount      number        // increment

auctions/{auctionId}.viewStats           // campo agregado en el doc del remate
  { total: number, unique: number }

auctions/{auctionId}/priceChanges/{autoId}
  field          'startingPrice' | 'reservePrice'
  from           number | null   // null cuando reservePrice pasa de ausente a valor
  to             number | null   // null cuando reservePrice se quita
  isReduction    boolean         // to < from (solo comparable cuando ambos son número)
  actorUid       string
  actorName      string          // displayName/email del staff que editó
  at             Timestamp

vehicles/{vehicleId}.firstListedAt   Timestamp   // estampado al crear su PRIMERA subasta
vehicles/{vehicleId}.unsoldAlertAt   Timestamp   // marca de "email de 7 días ya enviado"
```

Reglas de lectura: `viewers` y `priceChanges` solo legibles por admin/staff.
Escritura: **solo Admin SDK** (Cloud Functions); ningún write directo de cliente.

## 3. Componentes

### 3.1 Captura de vistas

- **Cliente** — `ViewTracker` (componente invisible, `'use client'`) montado en
  el detalle del remate (`(protected)/auctions/[id]`). En mount dispara el
  callable `logAuctionView({ auctionId })` fire-and-forget (jamás bloquea ni
  rompe el render; errores se tragan con `console.warn`).
- **Throttle cliente** — `sessionStorage` clave `renew:view:{auctionId}`: no
  re-loguea si la última vista registrada fue hace <30 min. Recargas y
  navegación interna no inflan contadores.
- **Callable `logAuctionView`** (`functions/src/insights/logAuctionView.ts`):
  - `requireSignedIn` + `status === 'active'`.
  - Si `role` es `admin`, `staff` o `finanzas` → **no-op** (devuelve ok sin
    escribir). Solo se registran buyers.
  - Input Zod: `{ auctionId: string }`. Verifica que el remate exista.
  - Transacción: upsert `viewers/{uid}` (increment `viewCount`, set
    `lastViewAt`; en primera vista set `firstViewAt` + snapshot de nombre) +
    increment `viewStats.total` siempre y `viewStats.unique` solo si el viewer
    es nuevo.
  - Rate limit servidor: reusa el patrón de `placeBid` (`rate_limits/` doc,
    ventana 1 min, máx 20) para que un cliente hostil no infle contadores.

### 3.2 Historial de precio

- Hook **dentro de `updateAuction`** (que ya calcula `before`/`after` para el
  audit log): si el update incluye `startingPrice` o `reservePrice` con valor
  distinto al actual → escribir un doc en `priceChanges` por cada campo
  cambiado, con `isReduction = typeof from === 'number' && typeof to === 'number' && to < from`.
- `actorName`: displayName del actor (lookup `users/{actorUid}` ya disponible
  en el callable) o email como fallback.
- El audit log existente no cambia (queda como está).

### 3.3 Estampa `firstListedAt`

- En `createAuction`: al crear una subasta, si el vehículo no tiene
  `firstListedAt`, se estampa `serverTimestamp()`. Un vehículo re-listado
  conserva su primera fecha (es el ancla del "lleva X días sin venderse").

### 3.4 Alerta 7 días — scheduler `dailyUnsoldDigest`

- `onSchedule` diario **09:00 America/Asuncion**
  (`functions/src/insights/dailyUnsoldDigest.ts`).
- Query: `vehicles` donde `firstListedAt <= now - 7d` y `status` ∉
  {`sold`, `archived`} y sin `unsoldAlertAt`.
- Si hay resultados: **un solo email** (Resend, `emailShell` existente) a todos
  los usuarios activos con rol admin o staff. Por vehículo: marca/modelo/año,
  días publicado, vistas únicas, precio actual (última subasta), bajadas de
  precio, link a `/es/staff/insights/{vehicleId}`.
- Marca `unsoldAlertAt` en cada vehículo incluido (transaccional respecto al
  envío: primero email OK, después marcas; si el email falla, no marca y
  reintenta mañana).
- El **badge rojo** del reporte NO depende del email: se calcula en vivo
  (`firstListedAt` ≥7 días y no vendido).

### 3.5 UI — Reporte

- **Nav**: entrada "Reporte" (icono `chart`/`activity`) en `nav-config.ts` para
  admin y staff → `/staff/insights`.
- **`/staff/insights` (lista)** — server component, guard igual a `staff/bids`
  (admin+staff; otros → `notFound`). Por vehículo (no por subasta): foto,
  marca/modelo/año, estado, **días publicado** (badge rojo si ≥7 y no vendido),
  vistas únicas/totales (únicos por subasta, sumados entre las subastas del
  vehículo — un mismo comprador que miró dos subastas del mismo auto cuenta
  dos veces; precisión perfecta cross-subasta no vale el costo en v1), #
  bajadas de precio, precio actual, orden por días publicado desc. Mobile-first: cards apiladas en
  pantalla chica, tabla en `lg+` (mismo patrón que staff/bids).
- **`/staff/insights/[vehicleId]` (detalle)** —
  - Timeline de precio: lista cronológica de `priceChanges` (quién, cuándo,
    de → a, flecha roja si bajada).
  - Viewers: lista completa (nombre + inicial, veces, última visita), ordenada
    por `lastViewAt` desc.
  - Historial de subastas del vehículo: cada una con status/outcome/finalPrice.
- Datos leídos server-side con Admin SDK (helpers en `apps/web/src/lib/insights/`),
  mismo patrón que `load-buyer-stats`/staff pages. Sin realtime en v1.

## 4. Seguridad

- Firestore rules: `viewers` y `priceChanges` → `read` solo admin/staff,
  `write: false` (Admin SDK only). `viewStats`/`firstListedAt`/`unsoldAlertAt`
  viven en docs existentes ya protegidos.
- `logAuctionView` no acepta más input que `auctionId`; nombre siempre
  snapshot server-side; rate-limited.
- El email de digest no incluye datos de compradores (solo agregados) —
  nombres de viewers solo dentro del panel.

## 5. Tests

- `logAuctionView`: crea viewer + agregados en primera vista; increment en
  repetida (unique no sube); staff/admin no-op; rate limit; remate inexistente
  → not-found; sin auth → unauthenticated.
- `updateAuction` priceChanges: bajada (`isReduction true`), suba, cambio de
  reservePrice ausente→valor (`from null`), sin cambio de precio → no escribe.
- `createAuction`: estampa `firstListedAt` solo la primera vez.
- `dailyUnsoldDigest`: detecta vehículo 7+ días; idempotente (`unsoldAlertAt`);
  ignora sold/archived y <7 días; email a admin+staff activos.
- Rules: buyer no puede leer `viewers`/`priceChanges`; staff sí.

## 6. Deploy

1. `firestore.rules` + índices si hacen falta (`vehicles` por
   `firstListedAt+status` para el digest).
2. Functions: `logAuctionView`, `dailyUnsoldDigest`, hooks en
   `updateAuction`/`createAuction`.
3. Web: ViewTracker + páginas insights + nav (deploy manual Netlify, runbook
   habitual: functions ANTES que web para que el callable exista cuando el
   tracker dispare).

## 7. Riesgos / notas

- **Datos desde cero**: vistas y priceChanges existen recién desde el deploy.
  El reporte muestra "—" para lo anterior. Expectativa a comunicar al dueño.
- **Volumen**: 1 write por vista throttleada; escala de subastas de autos =
  costo Firestore despreciable.
- **Digest y zona horaria**: 09:00 Asunción fija; si cambia la preferencia es
  un string en el scheduler.
- Relación con [[project_deploy-mechanism]]: deploy manual, sin CI.
