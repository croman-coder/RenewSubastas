# Compra Ya + marca VENDIDO — Design

**Fecha:** 7 de agosto de 2026
**Estado:** aprobado, pendiente de plan de implementación

## Problema

Hoy una subasta sólo se puede cerrar de dos formas: que venza su plazo (`tickAuctions`) o que staff la cancele. Faltan dos caminos que el negocio ya necesita:

1. **Un comprador quiere cerrar ya**, sin esperar al viernes. No existe forma de hacerlo.
2. **La unidad se vende en el salón** mientras su subasta corre. No hay manera de retirarla marcándola como vendida — sólo cancelarla, que dice otra cosa.

Además, al investigar salió un tercer hueco: **cuando se adjudica un auto hoy, nadie de Santa Rosa recibe aviso.** Los únicos correos internos salen cuando el comprador sube el comprobante (a administración) y cuando admin confirma el pago (a ventas). Si el ganador nunca sube nada, la venta queda muda del lado interno.

## Decisiones tomadas

| Decisión                  | Elegido                                           | Por qué                                                                                                                  |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Precio de Compra ya       | **Por encima del objetivo**                       | Si fuera igual a la reserva, nadie pujaría nunca: la subasta se volvería precio fijo y se perdería el margen para arriba |
| Con pujas existentes      | **El botón desaparece**                           | Arrancada la subasta se define pujando. Nadie le gana la unidad a un postor por afuera                                   |
| Venta de salón con pujas  | **Se marca y se avisa**                           | Honesto y trazable. Los términos dicen que las pujas son firmes, así que el aviso es obligatorio                         |
| Alcance de VENDIDO        | **Estado real, visible hasta el cierre del lote** | No es un cartel: es un hecho del negocio. Queda de prueba social mientras dura el lote                                   |
| Registro de venta externa | **Resultado aparte + precio real**                | No hubo puja, ni seña, ni comprobante. Meterla en el GMV mentiría en los reportes                                        |
| Aviso interno             | **Staff + admin + administración**                | Administración cobra la seña; staff necesita saber que su unidad se vendió                                               |

### Contradicción resuelta

Vigorito planteó: _auto en 18.000, incremento 500, alguien puja y otro quiere comprar directo_. Eso describe comprar después de una puja, lo que chocaba con la decisión de que el botón desaparece.

**Resuelto:** el botón desaparece. En ese escenario Ana debe pujar 19.000. El precio lo fija la competencia, no un atajo.

## Modelo de datos

### Doc de subasta (legible por comprador de su audiencia)

```
buyNowPrice?: number          // visible, es el precio del botón
soldOfflinePriceUsd?: number  // precio real de salón
soldOfflineAt?: Date
soldOfflineBy?: string        // uid del staff/admin, auditoría
```

`buyNowPrice` va en el doc público **a propósito**: es un precio que queremos mostrar.

### Subcolección privada — sin cambios

```
auctions/{id}/private/internal → { reservePrice }
```

El precio objetivo sigue fuera del alcance del comprador. Esa separación se hizo para que nadie pueda pujar exactamente en la reserva, y este diseño no la toca.

### Resultado nuevo

```
outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline'
```

`sold_offline` **no** entra al GMV del dashboard ni al panel de finanzas. Requiere ajustar los dos loaders que hoy filtran por `outcome === 'sold'`.

### Validación

- `buyNowPrice > reservePrice`, rechazado en `createAuction` y `updateAuction`. Si fuera menor, comprar ya costaría menos que la reserva y `tickAuctions` marcaría `reserve_not_met` sobre una unidad ya vendida.
- `buyNowPrice` es **opcional**. Sin él, no se muestra el botón.

### Visibilidad "hasta el cierre del lote"

Sin campo nuevo. `listPublicAuctions` pasa a incluir las `ended` con outcome `sold`/`sold_offline` cuyo `endsAt` original todavía no pasó. Al vencer el lote desaparecen solas.

## Backend

### `lib/close-auction.ts` — extracción compartida

```
closeAuctionAsSold(tx, { auctionRef, vehicleRef, winnerUid, finalPrice,
                         depositPercent, deadlineHours, now })
  → status:'ended', outcome:'sold', winnerUid, finalPrice
  → paymentStatus:'pending_payment', paymentDepositPercent,
    paymentDepositUsd, paymentDeadline
  → vehículo: status:'sold'
```

Hoy ese bloque vive suelto dentro de `tickAuctions`. Al extraerlo, el redondeo de la seña (`Math.round(x * pct * 100) / 100`) y el cálculo del plazo quedan definidos **una sola vez**. Es la parte que no se debe duplicar: son plata.

`tickAuctions` pasa a llamarlo en su rama `sold`, sin cambio de comportamiento.

### `buyNow` — callable nuevo

Transacción, todas las lecturas antes de los writes:

1. `requireSignedIn` → rol `buyer`, `status: 'active'`
2. Rechazar si no está `live`, si `endsAt` ya pasó, o si **`bidCount > 0`**
3. Validar audiencia contra el claim
4. Rechazar si no hay `buyNowPrice`
5. Rate limit (patrón de `placeBid`)
6. `closeAuctionAsSold(...)` con `winnerUid = uid`, `finalPrice = buyNowPrice`
7. Escribir doc en `bids` con `source: 'buy_now'`, para que el panel de Pujas y el historial no tengan un hueco

El paso 2 se revalida en servidor porque un cliente puede tener la página vieja abierta. La carrera de dos compras simultáneas la resuelve la transacción: la segunda reintenta, relee `ended` y falla limpio.

**No** se toca `placeBid`. Es la transacción más compleja y sensible del sistema; meterle una rama que termina la subasta agrandaría el radio de daño de la función que menos conviene romper.

### `markSoldOffline` — callable nuevo

1. `requireSignedIn` → **`admin` o `staff`** (finanzas no: sólo opera el cobro)
2. Rechazar si no está `live` o `scheduled`
3. `status:'ended'`, `outcome:'sold_offline'`, `soldOfflinePriceUsd`, `soldOfflineAt`, `soldOfflineBy`
4. Vehículo → `status:'sold'`
5. **Sin** `winnerUid`, **sin** campos de pago
6. `writeAuditLog`
7. Pujas activas → `outbid`

Deliberadamente **no** reusa `closeAuctionAsSold`: esa función existe para escribir los campos de dinero de una venta de plataforma, y acá no hay ninguno. Forzarla con banderas la convertiría en lo que se quiso evitar.

### `sendAuctionSoldOffline` — trigger nuevo

Dispara con la transición a `sold_offline`. Resuelve postores únicos desde `bids`, manda un correo por persona explicando que la unidad se vendió en salón, registra en `notifications`. Misma forma que `sendBidOutbid`.

### `sendAuctionSoldInternal` — trigger nuevo

Dispara sobre la **misma transición** que `sendAuctionWon` (`ended` + `sold` + `winnerUid`), así cubre Compra ya **y** subasta ganada — cerrando el hueco que ya existía.

- **Destinatarios:** `administracion@santarosa.com.py` (fijo) + todos los `admin` y `staff` activos, resueltos desde `users` con el patrón del digest diario
- **Contenido:** vehículo, precio final, seña esperada, fecha límite, datos del comprador, y etiqueta que distingue **Compra ya** de **subasta ganada**
- Campos del comprador pasan por `esc()` — el escape contra HTML inyectado en correos internos
- Best-effort: un correo caído nunca tumba una adjudicación

### Reglas de Firestore

Sin cambios. `buyNowPrice` y los `soldOffline*` van en el doc de subasta, ya legible por compradores de esa audiencia, y son públicos por diseño. La reserva no se mueve.

## UI

### Botón Compra ya — detalle de subasta

En `bid-panel`, arriba del formulario, separado por divisor. Sólo si existe `buyNowPrice` y `bidCount === 0`:

```
┌─────────────────────────────────┐
│  Compra ya                       │
│  USD 34.000                      │
│  [  Comprar ahora  ]             │
│  Cerrás la compra al instante.   │
└─────────────────────────────────┘
        ──────── o pujá ────────
```

**Confirmación obligatoria** reusando el `Dialog` de confirmación de pujas: _"Vas a comprar el Toyota Hilux 2021 por USD 34.000. La subasta cierra al instante y tenés 24 h para abonar la seña."_ Un click accidental cuesta miles de dólares.

Deslogueado: ve el precio, el botón lleva a `/login?from=...`.

Después de comprar, el `onSnapshot` existente repinta el panel y el comprador cae en `/won/[id]`. Cero pantallas nuevas.

### Franja VENDIDO

Componente `SoldBanner`, usado en tarjeta y detalle:

- Diagonal roja sobre la foto en la tarjeta (legible en miniatura)
- Barra roja de ancho completo en el detalle
- El panel de pujas se reemplaza por _"Esta unidad ya no está disponible."_

Aplica a `sold_offline` **y** a `sold`. Un auto vendido es un auto vendido; distinguirlos en la vitrina no le sirve a nadie de afuera.

Respeta `prefers-reduced-motion`; el contraste va sobre la foto.

### Staff/admin — marcar VENDIDO

En `auction-detail-view`, junto a Cancelar. Sólo con `status` en `live` o `scheduled`. Visible para **staff y admin**.

Diálogo destructivo con dos campos: precio real de venta (requerido) y confirmación tipeada. Con advertencia explícita cuando hay pujas:

> ⚠️ Esta subasta tiene **3 pujas activas**. Al marcarla vendida, se les avisa por correo que la unidad se vendió en salón.

Que el staff vea el costo humano antes de apretar.

### Staff — cargar el precio de Compra ya

Un campo más en el formulario de edición, junto a la reserva:

```
Precio objetivo (reserva)   [ 30000 ]  ← no visible para compradores
Precio Compra ya            [ 34000 ]  ← visible · opcional
```

Validación en vivo: si `buyNow ≤ reserva`, error inline y submit deshabilitado. Las etiquetas dicen cuál se ve y cuál no, porque esa confusión sería cara.

### Sin cambios

Home del comprador, contador del lote, dashboards y páginas legales.

## Errores

| Situación                              | Comportamiento                                                            |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Dos compras simultáneas                | Transacción: una gana, la otra recibe _"Esta unidad ya se vendió"_        |
| Compra con página vieja (ya hay pujas) | Servidor rechaza por `bidCount > 0`                                       |
| Compra justo al vencer                 | Rechazada si `endsAt` pasó; `tickAuctions` cierra normal                  |
| VENDIDO sobre una ya cerrada           | Rechazado: sólo `live` o `scheduled`                                      |
| Falla el mail a postores o interno     | La venta **queda registrada igual**; se anota `failed` en `notifications` |
| Comprador de otra audiencia            | Rechazado, igual que `placeBid`                                           |
| `buyNowPrice ≤ reserva`                | Rechazado al guardar, no al comprar                                       |

Regla general: **la venta nunca se pierde por una falla de notificación.**

## Testing

Contra emulador, como el resto del repo.

**`closeAuctionAsSold`** — el más importante, toca plata:

- Seña, monto y plazo con el redondeo correcto
- `tickAuctions` sigue produciendo los mismos campos que antes del refactor

**`buyNow`**

- Compra feliz → `ended`/`sold`, `finalPrice` correcto, campos de pago escritos
- Rechaza con `bidCount > 0`, si no está `live`, si venció, otra audiencia, sin `buyNowPrice`
- **Concurrencia:** dos compras simultáneas → exactamente una gana
- Rate limit

**`markSoldOffline`**

- Marca y guarda el precio de salón
- Rechaza `buyer` y `finanzas`; acepta `staff` y `admin`
- Rechaza si ya está cerrada
- Pujas activas → `outbid`
- **No** escribe `winnerUid` ni campos de pago
- `sold_offline` **no** aparece en GMV ni en el panel de finanzas ← protege los reportes

**`sendAuctionSoldInternal`**

- Dispara una sola vez por transición
- Incluye administración y los admin/staff activos
- Distingue Compra ya de subasta ganada

**Regresión**

- Los 6 tests de `tickAuctions` pasan sin cambiar expectativas
- `placeBid` intacto (14 tests) — la señal de que no se tocó lo sensible

## Orden de implementación

El refactor de `tickAuctions` toca la ruta que adjudica y calcula señas: es el cambio más delicado. Va **primero y solo**, con su propio commit verificado, antes de construir `buyNow` encima. Si algo se rompe ahí, se ve aislado.

1. Extraer `closeAuctionAsSold` + verificar regresión de `tickAuctions`
2. Schema: `buyNowPrice`, `sold_offline`, campos `soldOffline*` + validación
3. `buyNow` callable + UI del botón
4. `markSoldOffline` callable + UI de staff + `SoldBanner`
5. `sendAuctionSoldOffline` + `sendAuctionSoldInternal`
6. Ajustar loaders de GMV/finanzas y `listPublicAuctions`
