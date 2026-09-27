# Celular del comprador, estilo MotorHub adaptado a Renew — diseño

Fecha: 2026-09-27 · Estado: aprobado por Croman (maquetas del 27/9) · Alcance: comprador con sesión

## 1. Qué y por qué

Croman pidió un diseño de celular inspirado en MotorHub (motorhub.tech/onboarding), siempre
adaptado a nuestra app. Casi todos los compradores entran desde el teléfono (Instagram 43 %,
Facebook 34 %, auditoría del 26/9) y la app del comprador está pensada para escritorio: el menú es
un cajón lateral detrás de una hamburguesa, el inicio es una grilla de tarjetas grandes y, en la
ficha, el panel de puja queda debajo de fotos, especificaciones y descripción.

De MotorHub tomamos la **estructura**, no el estilo:

- inicio como tablero con los números propios y "la próxima que cierra" con cuenta regresiva;
- barra de pestañas abajo, al alcance del pulgar;
- listado compacto con miniaturas y estado propio en cada auto;
- en la ficha, un botón fijo abajo que abre la puja en una hoja desde abajo;
- historial con estados.

Se mantiene "tinta y papel" (`DESIGN.md`): nuestros tokens, sin vidrio ni desenfoque (la barra
de pestañas es sólida), sin brillos, estados con las variantes de `Badge`.

## 2. Decisiones

| Tema                 | Decisión                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alcance              | Comprador con sesión: inicio, catálogo, ficha, Mis pujas, Ganadas (solo barra). Visitante y staff no cambian.                                                                                                                         |
| Tema                 | Sigue al teléfono: `defaultTheme="system"` en `ThemeProvider` (hoy `"light"`). Quien eligió un tema a mano lo conserva. Aplica a toda la app porque `next-themes` es global; las superficies ya tienen tokens oscuros.                |
| Punto de corte       | Celular = por debajo de `lg` (1024 px), el mismo corte que hoy separa cajón y menú lateral. En escritorio todo queda como está salvo el inicio (§5.2).                                                                                |
| Barra de pestañas    | Solo comprador, solo < `lg`: Inicio · Subastas · Mis pujas · Ganadas (los cuatro ítems de `getNavItems('buyer')`). Reemplaza a la hamburguesa para el comprador. Se oculta en la ficha (`/auctions/{id}`), donde manda el botón fijo. |
| Confirmación de puja | Se conserva la lógica actual de `BidPanel` tal cual (elegir monto → diálogo "Las pujas son en firme…" → `placeBid`). En celular el panel vive dentro de la hoja; no se toca nada que mueva plata.                                     |
| Catálogo             | Se adaptan las pestañas existentes (Todas · Cierran pronto · Favoritas) como control segmentado; se agrega búsqueda por marca, modelo o año sobre la lista ya cargada (sin consulta nueva).                                           |
| Datos                | No hay colecciones ni reglas nuevas. Todo sale de `loadBuyerStats`, `listPublicAuctions`, `listMyBids`, `listMyWon` y la configuración de pagos existente.                                                                            |

## 3. Componentes nuevos

- `components/ui/bottom-sheet.tsx` — hoja desde abajo sobre Radix Dialog (ya instalado): foco
  atrapado, Escape, bloqueo de scroll y retorno del foco gratis. Borde superior redondeado 24 px,
  agarradera, `max-h-[88dvh]` con scroll interno, `pb-[env(safe-area-inset-bottom)]`, animación
  `slide-in-from-bottom` de `tailwindcss-animate` (ease-out, sin rebote).
- `components/shell/bottom-tab-bar.tsx` — cliente; `fixed inset-x-0 bottom-0 lg:hidden`, fondo
  `bg-elev`, hairline arriba, altura 64 px + `env(safe-area-inset-bottom)`. Ítem activo con
  `usePathname` y la misma regla `exact` de `SidebarNav`; indicador = barra de 3 px en tinta arriba
  del ícono + texto en `text-strong`; inactivos `text-subtle`. `aria-current="page"`, destinos
  táctiles ≥ 48 px. Devuelve `null` en `/{locale}/auctions/{id}`.
- `components/auctions/bid-dock.tsx` — cliente; barra fija abajo en la ficha (< `lg`) con el
  estado de la subasta y un botón que abre la hoja con `BidPanel`.
- Pure helpers en `lib/buyer/mobile-home.ts`, `lib/buyer/search.ts`, `lib/auctions/dock-state.ts`
  y `lib/buyer/my-auction-states.ts` (§6), con tests.

## 4. Shell (`AppShell`, `Topbar`)

- `AppShell` monta `BottomTabBar` para `role === 'buyer'` y, en ese caso, agrega al `<main>`
  `pb-[calc(64px+env(safe-area-inset-bottom)+1rem)] lg:pb-7` para que nada quede tapado.
- `Topbar` oculta la hamburguesa (y no monta el cajón) cuando el rol es comprador; staff y admin
  siguen con el cajón. La campana de notificaciones y el menú de usuario (Ajustes, Cerrar sesión)
  quedan en la barra de arriba, como en las maquetas.
- `PushPermissionPrompt` no cambia.

## 5. Pantallas

### 5.1 Barra de pestañas

Ver §3. Íconos de `lucide-react` iguales a los del menú lateral.

### 5.2 Inicio (`app/[locale]/(protected)/[audience]/page.tsx`)

Mismo layout en todos los anchos, primero celular (en escritorio los bloques se acomodan en dos
columnas); la grilla "Vehículos disponibles" sigue abajo sin cambios.

1. Saludo: eyebrow "Hola, {firstName}" + H1 "Tu actividad de hoy".
2. Números: tarjeta con tres columnas — Vas ganando (verde si > 0) · Mis pujas · Ganadas — que
   enlazan a donde enlazan hoy (`ActivityLink`). "Activas" pasa a la pestaña Subastas.
3. **La próxima que cierra** (tarjeta en tinta, la única superficie invertida): la subasta que vas
   ganando con cierre más próximo; si no vas ganando ninguna, la próxima de `closingSoon` con
   subtítulo "Todavía no pujaste". Miniatura, título, "Vas ganando · USD X" o "Puja actual USD X",
   reloj grande HH:MM:SS que corre en el cliente, "quedan N min", barra de progreso (§6
   `closeProgress`), "Cierra HH:MM" (hora de Paraguay con `formatDateTimePy`) e "Ir a la subasta ›".
   Sin ninguna de las dos: no se muestra.
4. **Si ganás todo** y **Seña a pagar**: suma de las pujas que vas ganando y su seña con el
   porcentaje real de `app_config/global.payment` (hoy 10 %), "N subastas que vas ganando" y "10 %
   en 24 h al ganar". Se muestran solo si vas ganando al menos una.
5. **Cierran pronto**: fila deslizable con `closingSoon` (miniatura, modelo, USD, tiempo); "Ver
   todas" → catálogo en la pestaña Cierran pronto. Sin datos: no se muestra.

`loadBuyerStats`: `myWinning` sube de 5 a 20 (la suma del punto 4 necesita todas) y `closingSoon` de 3 a 6. Montos con `formatAmount`/`formatUsd`, horas con `formatDateTimePy`.

### 5.3 Subastas (`app/[locale]/(protected)/auctions/*`)

- < `lg`: pestañas como control segmentado de tres; debajo, buscador "Marca, modelo o año" que
  filtra la lista cargada en el cliente (§6 `matchesSearch`, sin tildes ni mayúsculas).
- < `sm`: cada subasta es una fila (miniatura 104×84, modelo y año, "Puja actual/Precio inicial USD
  X", estado y tiempo). Desde `sm` sigue la grilla de tarjetas actual.
- Estado propio en la fila y en la tarjeta: "Vas ganando" (`success`), "Te superaron" (`danger`),
  si no "Compra ya USD X" (`info`) o "Sin pujas" (`neutral`). Sale de `listMyBids` (§6
  `myAuctionStates`); la página del catálogo lo carga en paralelo con lo que ya carga.
- Favoritos: el corazón se mantiene.

### 5.4 Ficha con sesión (`(abierto)/auctions/[id]/auction-detail-view.tsx`)

- Orden en celular igual que la ficha pública (tanda 2A): fotos → estado y título → cuenta
  regresiva → precio → datos. En escritorio no cambia.
- < `lg`: el `BidPanel` del aside se oculta y aparece `BidDock` fijo abajo:
  - en vivo y no vas ganando: "Tu próxima puja USD X" + botón **Pujar**;
  - en vivo y vas ganando: "Vas ganando · USD X" + botón **Subir puja**;
  - programada: "Abre en HH:MM:SS" sin botón;
  - terminada: no se muestra (el resultado ya está en la página).
    X es el mínimo siguiente (`lib/auctions/minimum-bid`). El botón abre la hoja con el mismo
    `BidPanel` (misma lógica, mismos diálogos, "Compra ya" incluido). La hoja se cierra sola cuando
    la puja queda confirmada.
- La barra de pestañas no se muestra en la ficha.

### 5.5 Mis pujas (`[audience]/bids/*`)

- < `sm`: lista en lugar de tabla. Arriba, una tarjeta por cada subasta en vivo donde te superaron:
  "Te superaron" + modelo + "Ahora USD X · cierra en …" + botón ancho **Volver a pujar · USD Y**
  (a la ficha). Debajo, "Historial": filas con modelo, "Tu puja USD X · fecha" y estado
  (Ganando · Superada · Ganada · Perdida). Las pestañas actuales se mantienen arriba.
- Desde `sm` sigue la tabla.

### 5.6 Ganadas

Ya es una lista apta para celular; solo gana la barra de pestañas.

## 6. Lógica pura (con tests)

- `pickNextClosing(stats, nowMs)` → `{ kind: 'winning' | 'closing', item } | null`.
- `closeProgress(endsAtMs, nowMs)` → 0..1, ventana de 24 h (`1 - restante/24 h`, acotado).
- `commitment(myWinning, depositPercent)` → `{ totalUsd, depositUsd, count }` (seña redondeada al
  dólar).
- `matchesSearch(item, query)` → marca, modelo y año, sin tildes ni mayúsculas; consulta vacía = todo.
- `myAuctionStates(entries)` → `Map<auctionId, 'winning' | 'outbid'>` solo para subastas en vivo.
- `dockState(live, myUid, nowMs, minBid)` → `{ kind: 'bid' | 'raise' | 'scheduled' | 'hidden', amountUsd?, opensInMs? }`.

## 7. Verificación

- Tests unitarios de §6; typecheck, lint, suite completa.
- Capturas con emuladores (`seed-demo-video`, comprador `demo.comprador@renew.test`) a 390 px en
  claro y oscuro de: inicio, catálogo, ficha con dock, hoja abierta, Mis pujas; y a 1280 px del
  catálogo, la ficha y Mis pujas para confirmar que escritorio no cambió.
- Una puja real en el emulador desde la hoja: la hoja se cierra, el precio sube, el dock pasa a
  "Vas ganando".
- `functions/scripts/verify-public-auctions.ts` sigue en verde (la ficha pública no cambia).
- Accesibilidad: foco atrapado en la hoja, `aria-current` en la pestaña, contraste AA en claro y
  oscuro.

## 8. Fuera de alcance

Visitante sin cuenta y staff/admin; aviso con número en la pestaña Mis pujas (necesita datos en
vivo que el shell no tiene); gestos de deslizar para cerrar la hoja; app nativa.

## 9. Riesgos

| Riesgo                                                                                      | Mitigación                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `defaultTheme="system"` cambia a oscuro también a staff/escritorio con el sistema en oscuro | Los tokens oscuros ya existen; se revisan con capturas el panel de staff y admin en oscuro antes de publicar. |
| Dos `BidPanel` (aside oculto + hoja)                                                        | El de la hoja solo se monta abierto; el estado real viene de `onSnapshot` del padre, no del panel.            |
| Lecturas extra en el catálogo por `listMyBids`                                              | Una consulta por vista del comprador; se mide en la captura de Firestore del emulador.                        |
