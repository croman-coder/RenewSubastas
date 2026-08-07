# Compra Ya + marca VENDIDO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cerrar una subasta antes de su vencimiento por dos caminos: compra directa a precio fijo por parte de un comprador, y marcado manual como vendida en salón por staff/admin.

**Architecture:** Se extrae de `tickAuctions` un helper `closeAuctionAsSold` que define en un solo lugar los campos de dinero de una venta de plataforma (seña, monto, plazo). El nuevo callable `buyNow` lo reusa; `markSoldOffline` escribe un estado terminal distinto sin campos de pago. Dos triggers nuevos cubren las notificaciones. `placeBid` no se toca.

**Tech Stack:** Firebase Cloud Functions v2 (onCall/onDocumentUpdated), Firestore transactions, Zod, Vitest contra emulador, Next.js 14 App Router, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-07-compra-ya-vendido-design.md`

## Global Constraints

- Los tests de functions corren contra el emulador: `pnpm emulators` en otra terminal, o `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`.
- Firestore exige **todas las lecturas antes de todas las escrituras** dentro de una transacción.
- `reservePrice` vive en `auctions/{id}/private/internal`, NUNCA en el doc de subasta.
- Texto de UI de staff en español hardcodeado (patrón de `staff/bids/page.tsx`), sin claves i18n.
- Todo callable nuevo lleva `enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false'` y región `us-central1`.
- Ids provenientes del cliente usan `DocId` de `functions/src/lib/ids.ts`, nunca `z.string().min(1)`.
- Campos controlados por el usuario que se interpolan en emails pasan por `esc()` de `lib/email-templates.ts`.
- Los emails son best-effort: nunca deben hacer fallar la venta.

## File Structure

**Functions:**

- Create `functions/src/lib/close-auction.ts` — helper compartido de cierre vendido.
- Create `functions/src/lib/close-auction.test.ts`
- Modify `functions/src/auctions/tickAuctions.ts` — usar el helper.
- Create `functions/src/auctions/buyNow.ts` (+ test)
- Create `functions/src/auctions/markSoldOffline.ts` (+ test)
- Create `functions/src/notifications/sendAuctionSoldOffline.ts` (+ test)
- Create `functions/src/notifications/sendAuctionSoldInternal.ts` (+ test)
- Modify `functions/src/auctions/createAuction.ts`, `updateAuction.ts` — `buyNowPrice`.
- Modify `functions/src/index.ts` — exports.

**Shared types:**

- Modify `packages/shared-types/src/auction.ts` y su espejo `functions/src/_shared/auction.ts`.

**Web:**

- Create `apps/web/src/components/auctions/sold-banner.tsx`
- Create `apps/web/src/app/[locale]/(protected)/staff/auctions/[id]/mark-sold-dialog.tsx`
- Modify `bid-panel.tsx`, `auction-detail-view.tsx`, el form de edición de subasta, `list-public-auctions.ts`, los loaders de GMV/finanzas.

---

## Task 1: Extraer `closeAuctionAsSold`

El cambio más delicado del lote: toca la ruta que adjudica y calcula señas. Va primero y solo.

**Files:**

- Create: `functions/src/lib/close-auction.ts`
- Create: `functions/src/lib/close-auction.test.ts`
- Modify: `functions/src/auctions/tickAuctions.ts:99-126`

**Interfaces:**

- Produces: `closeAuctionAsSold(tx, args): void` donde
  `args = { auctionRef: FirebaseFirestore.DocumentReference; vehicleRef: FirebaseFirestore.DocumentReference | null; winnerUid: string; finalPrice: number; depositPercent: number; deadlineHours: number; nowMs: number }`

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/src/lib/close-auction.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin.js';
import { closeAuctionAsSold } from './close-auction.js';

async function clearAll() {
  for (const c of ['auctions', 'vehicles']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('closeAuctionAsSold', () => {
  beforeEach(clearAll);

  it('escribe estado, ganador y los campos de dinero con el redondeo correcto', async () => {
    const db = adminDb();
    const aRef = db.doc('auctions/a1');
    const vRef = db.doc('vehicles/v1');
    await aRef.set({ status: 'live', currentBid: 0 });
    await vRef.set({ status: 'in_auction' });

    const now = 1_800_000_000_000;
    await db.runTransaction(async (tx) => {
      await tx.get(aRef);
      await tx.get(vRef);
      closeAuctionAsSold(tx, {
        auctionRef: aRef,
        vehicleRef: vRef,
        winnerUid: 'buyer-1',
        // 33333.33 * 0.1 = 3333.333 -> debe redondear a 3333.33
        finalPrice: 33333.33,
        depositPercent: 0.1,
        deadlineHours: 24,
        nowMs: now,
      });
    });

    const a = (await aRef.get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold');
    expect(a['winnerUid']).toBe('buyer-1');
    expect(a['finalPrice']).toBe(33333.33);
    expect(a['paymentStatus']).toBe('pending_payment');
    expect(a['paymentDepositPercent']).toBe(0.1);
    expect(a['paymentDepositUsd']).toBe(3333.33);
    expect((a['paymentDeadline'] as Timestamp).toMillis()).toBe(now + 24 * 3600_000);
    expect((await vRef.get()).data()!['status']).toBe('sold');
  });

  it('tolera una subasta sin vehículo asociado', async () => {
    const db = adminDb();
    const aRef = db.doc('auctions/a2');
    await aRef.set({ status: 'live' });
    await db.runTransaction(async (tx) => {
      await tx.get(aRef);
      closeAuctionAsSold(tx, {
        auctionRef: aRef,
        vehicleRef: null,
        winnerUid: 'b',
        finalPrice: 1000,
        depositPercent: 0.1,
        deadlineHours: 24,
        nowMs: 1_800_000_000_000,
      });
    });
    expect((await aRef.get()).data()!['outcome']).toBe('sold');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test close-auction'`
Expected: FAIL — `Cannot find module './close-auction.js'`

- [ ] **Step 3: Implementar el helper**

Crear `functions/src/lib/close-auction.ts`:

```ts
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface CloseAsSoldArgs {
  auctionRef: FirebaseFirestore.DocumentReference;
  /** null cuando la subasta no tiene vehículo o fue borrado en duro. */
  vehicleRef: FirebaseFirestore.DocumentReference | null;
  winnerUid: string;
  finalPrice: number;
  depositPercent: number;
  deadlineHours: number;
  nowMs: number;
}

/**
 * Aplica los writes terminales de una venta de plataforma.
 *
 * Única definición de qué significa "vendida": el redondeo de la seña y el
 * cálculo del plazo viven acá y en ningún otro lado. Duplicarlos entre
 * tickAuctions y buyNow sería un bug de plata silencioso el día que uno
 * cambie y el otro no.
 *
 * El llamador debe haber hecho TODAS sus lecturas antes de invocar esto —
 * Firestore exige lecturas antes de escrituras dentro de una transacción.
 */
export function closeAuctionAsSold(
  tx: FirebaseFirestore.Transaction,
  {
    auctionRef,
    vehicleRef,
    winnerUid,
    finalPrice,
    depositPercent,
    deadlineHours,
    nowMs,
  }: CloseAsSoldArgs,
): void {
  tx.update(auctionRef, {
    status: 'ended',
    outcome: 'sold',
    winnerUid,
    finalPrice,
    paymentStatus: 'pending_payment',
    paymentDepositPercent: depositPercent,
    paymentDepositUsd: Math.round(finalPrice * depositPercent * 100) / 100,
    paymentDeadline: Timestamp.fromMillis(nowMs + deadlineHours * 3600_000),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (vehicleRef) {
    tx.update(vehicleRef, { status: 'sold', updatedAt: FieldValue.serverTimestamp() });
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test close-auction'`
Expected: PASS (2 tests)

- [ ] **Step 5: Reemplazar el bloque en tickAuctions**

En `functions/src/auctions/tickAuctions.ts`, agregar el import:

```ts
import { closeAuctionAsSold } from '../lib/close-auction.js';
```

Reemplazar desde `const auctionUpdate: Record<string, unknown> = {` hasta el cierre del bloque `if (vehicleRef && vehicleSnap?.exists) { ... }` por:

```ts
if (outcome === 'sold' && winnerUid) {
  closeAuctionAsSold(tx, {
    auctionRef: doc.ref,
    vehicleRef: vehicleRef && vehicleSnap?.exists ? vehicleRef : null,
    winnerUid,
    finalPrice: currentBid,
    depositPercent,
    deadlineHours,
    nowMs: now,
  });
} else {
  tx.update(doc.ref, {
    status: 'ended',
    outcome,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (vehicleRef && vehicleSnap?.exists) {
    tx.update(vehicleRef, {
      status: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
```

- [ ] **Step 6: Verificar que no hubo regresión**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test tickAuctions'`
Expected: PASS, 6 tests, sin cambiar ninguna expectativa. Si alguno falla, el refactor cambió comportamiento — revisar antes de seguir.

- [ ] **Step 7: Typecheck y suite completa**

Run: `pnpm --filter @carbid/functions typecheck && firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`
Expected: typecheck limpio, 132/132 tests.

- [ ] **Step 8: Commit**

```bash
git add functions/src/lib/close-auction.ts functions/src/lib/close-auction.test.ts functions/src/auctions/tickAuctions.ts
git commit -m "refactor(auctions): extract closeAuctionAsSold from tickAuctions"
```

---

## Task 2: Schema — `buyNowPrice`, `sold_offline`, campos de venta externa

**Files:**

- Modify: `packages/shared-types/src/auction.ts`
- Modify: `functions/src/_shared/auction.ts` (espejo idéntico)
- Test: `packages/shared-types/src/buy-now.test.ts` (crear)

**Interfaces:**

- Produces: `AuctionSchema` con `buyNowPrice?: number`, `soldOfflinePriceUsd?: number`, `soldOfflineAt?: Date`, `soldOfflineBy?: string`; `AuctionOutcomeSchema` incluye `'sold_offline'`.

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/shared-types/src/buy-now.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AuctionSchema, AuctionOutcomeSchema } from './auction.js';

const base = {
  id: 'a1',
  vehicleId: 'v1',
  vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
  startingPrice: 25000,
  bidIncrement: 500,
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3600_000),
  currentBid: 0,
  bidCount: 0,
  status: 'live' as const,
  createdBy: 'staff-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('campos de Compra ya y venta externa', () => {
  it('acepta buyNowPrice opcional', () => {
    expect(AuctionSchema.safeParse(base).success).toBe(true);
    expect(AuctionSchema.safeParse({ ...base, buyNowPrice: 34000 }).success).toBe(true);
  });

  it('rechaza buyNowPrice no positivo', () => {
    expect(AuctionSchema.safeParse({ ...base, buyNowPrice: 0 }).success).toBe(false);
  });

  it('acepta sold_offline como resultado', () => {
    expect(AuctionOutcomeSchema.safeParse('sold_offline').success).toBe(true);
  });

  it('acepta los campos de venta externa', () => {
    const parsed = AuctionSchema.safeParse({
      ...base,
      status: 'ended' as const,
      outcome: 'sold_offline' as const,
      soldOfflinePriceUsd: 28000,
      soldOfflineAt: new Date(),
      soldOfflineBy: 'staff-uid',
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @carbid/shared-types test buy-now`
Expected: FAIL — `sold_offline` rechazado y `buyNowPrice` como clave desconocida.

- [ ] **Step 3: Agregar los campos en `packages/shared-types/src/auction.ts`**

Cambiar la línea del outcome:

```ts
export const AuctionOutcomeSchema = z.enum([
  'sold',
  'reserve_not_met',
  'no_bids',
  // Vendida fuera de la plataforma (salón). NO entra al GMV: no hubo puja
  // ganadora, ni seña, ni comprobante que gestionar.
  'sold_offline',
]);
```

Dentro de `AuctionSchema`, después de `bidIncrement`:

```ts
  /**
   * Precio de compra directa. Visible para el comprador a propósito — es el
   * número del botón. Debe ser MAYOR que reservePrice: si fuera menor,
   * comprar ya costaría menos que la reserva y tickAuctions marcaría
   * reserve_not_met sobre una unidad ya vendida.
   */
  buyNowPrice: z.number().positive().optional(),
```

Después de `finalPrice`:

```ts
  /** Precio real al que se vendió en salón. Sólo con outcome sold_offline. */
  soldOfflinePriceUsd: z.number().positive().optional(),
  soldOfflineAt: z.date().optional(),
  /** uid del staff/admin que la marcó, para auditoría. */
  soldOfflineBy: z.string().optional(),
```

- [ ] **Step 4: Espejar en `functions/src/_shared/auction.ts`**

Aplicar exactamente los mismos tres bloques al espejo. `functions/` no depende del paquete, mantiene su copia a mano.

- [ ] **Step 5: Build y tests**

Run: `pnpm --filter @carbid/shared-types build && pnpm --filter @carbid/shared-types test && pnpm --filter @carbid/functions typecheck`
Expected: todo PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/auction.ts packages/shared-types/src/buy-now.test.ts functions/src/_shared/auction.ts
git commit -m "feat(schema): buyNowPrice + sold_offline outcome"
```

---

## Task 3: Validación de `buyNowPrice` en create/update

**Files:**

- Modify: `functions/src/auctions/createAuction.ts`
- Modify: `functions/src/auctions/updateAuction.ts`
- Test: `functions/src/auctions/updateAuction.test.ts` (agregar casos)

**Interfaces:**

- Consumes: `AuctionSchema` de Task 2.
- Produces: `createAuction` y `updateAuction` aceptan `buyNowPrice?: number | null` y rechazan `buyNowPrice <= reservePrice`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final del `describe` de `functions/src/auctions/updateAuction.test.ts`:

```ts
it('rechaza buyNowPrice menor o igual a la reserva', async () => {
  const id = await seedScheduledAuction({ reservePrice: 30000 });
  await expect(
    updateAuctionHandler(asStaff({ auctionId: id, buyNowPrice: 30000 })),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(
    updateAuctionHandler(asStaff({ auctionId: id, buyNowPrice: 29000 })),
  ).rejects.toMatchObject({ code: 'invalid-argument' });
});

it('acepta buyNowPrice mayor a la reserva', async () => {
  const id = await seedScheduledAuction({ reservePrice: 30000 });
  await updateAuctionHandler(asStaff({ auctionId: id, buyNowPrice: 34000 }));
  const a = (await adminDb().doc(`auctions/${id}`).get()).data()!;
  expect(a['buyNowPrice']).toBe(34000);
});

it('permite limpiar buyNowPrice con null', async () => {
  const id = await seedScheduledAuction({ reservePrice: 30000 });
  await updateAuctionHandler(asStaff({ auctionId: id, buyNowPrice: 34000 }));
  await updateAuctionHandler(asStaff({ auctionId: id, buyNowPrice: null }));
  const a = (await adminDb().doc(`auctions/${id}`).get()).data()!;
  expect(a['buyNowPrice']).toBeUndefined();
});
```

Si `seedScheduledAuction` no existe con esa firma en el archivo, adaptar al helper que ya use ese test, asegurando que escriba `reservePrice` en `auctions/{id}/private/internal`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test updateAuction'`
Expected: FAIL — `buyNowPrice` no reconocido.

- [ ] **Step 3: Agregar a `updateAuction.ts`**

En `InputSchema`, después de `reservePrice`:

```ts
  buyNowPrice: z.number().positive().finite().max(MAX_PRICE_USD).nullable().optional(),
```

Dentro de la transacción, después de resolver `reserveWrite`, agregar la validación cruzada. El precio efectivo de reserva es el que se está escribiendo en esta misma edición, o el ya guardado:

```ts
if (v.buyNowPrice !== undefined && v.buyNowPrice !== null) {
  // Comparar contra la reserva EFECTIVA tras esta edición: si el staff
  // cambia ambos en un solo submit, validar contra el valor viejo
  // aceptaría un par inconsistente.
  const effectiveReserve =
    reserveWrite !== undefined && reserveWrite !== null
      ? reserveWrite
      : ((privateSnap?.data()?.['reservePrice'] as number | undefined) ?? undefined);
  if (effectiveReserve !== undefined && v.buyNowPrice <= effectiveReserve) {
    throw new HttpsError(
      'invalid-argument',
      'El precio de Compra ya debe ser mayor al precio objetivo.',
    );
  }
  update['buyNowPrice'] = v.buyNowPrice;
} else if (v.buyNowPrice === null) {
  update['buyNowPrice'] = FieldValue.delete();
}
```

Asegurar que `privateSnap` se lea también cuando venga `buyNowPrice` (hoy sólo se lee si hay `reservePrice` o si está `scheduled`): ampliar esa condición a
`if (v.reservePrice !== undefined || v.buyNowPrice !== undefined || status === 'scheduled')`.

Y ajustar el guard de "nada cambió" para contemplar el caso de sólo `buyNowPrice`:
`if (Object.keys(update).length === 1 && reserveWrite === undefined && v.buyNowPrice === undefined)`.

- [ ] **Step 4: Agregar a `createAuction.ts`**

En su `InputSchema`:

```ts
  buyNowPrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
```

Antes del `tx.set` de la subasta:

```ts
if (
  v.buyNowPrice !== undefined &&
  v.reservePrice !== undefined &&
  v.buyNowPrice <= v.reservePrice
) {
  throw new HttpsError(
    'invalid-argument',
    'El precio de Compra ya debe ser mayor al precio objetivo.',
  );
}
```

Y en el objeto del `tx.set`, junto a los demás campos:

```ts
    ...(v.buyNowPrice !== undefined ? { buyNowPrice: v.buyNowPrice } : {}),
```

- [ ] **Step 5: Correr los tests**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test "updateAuction|createAuction"'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/auctions/createAuction.ts functions/src/auctions/updateAuction.ts functions/src/auctions/updateAuction.test.ts
git commit -m "feat(auctions): validate buyNowPrice above reserve on create/update"
```

---

## Task 4: Callable `buyNow`

**Files:**

- Create: `functions/src/auctions/buyNow.ts`
- Create: `functions/src/auctions/buyNow.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**

- Consumes: `closeAuctionAsSold` (Task 1), `buyNowPrice` (Task 2), `DocId` de `../lib/ids.js`, `requireSignedIn` de `../lib/errors.js`, `loadAppConfig` de `../lib/config.js`.
- Produces: `buyNowHandler(req): Promise<{ ok: true; finalPrice: number }>` y el export `buyNow`.

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/src/auctions/buyNow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { buyNowHandler } from './buyNow.js';

const AUCTION = 'a1';
const BUYER = 'buyer-1';

function asBuyer(uid = BUYER, audience = 'retail', data: Record<string, unknown> = {}) {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active', audience } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, ...data },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'vehicles', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const subs = await d.collection('bids').listDocuments();
        await Promise.all(subs.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seed(overrides: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`auctions/${AUCTION}`)
    .set({
      vehicleId: 'v1',
      audience: 'retail',
      status: 'live',
      startingPrice: 25000,
      buyNowPrice: 34000,
      bidIncrement: 500,
      currentBid: 0,
      bidCount: 0,
      startsAt: Timestamp.fromMillis(Date.now() - 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000),
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
      ...overrides,
    });
  await adminDb().doc('vehicles/v1').set({ status: 'in_auction' });
  await adminDb()
    .doc(`users/${BUYER}`)
    .set({
      email: 'b@example.com',
      profile: {
        firstName: 'Juan',
        lastName: 'Pérez',
        audience: 'retail',
        documentType: 'CI',
        documentNumber: '1234567',
      },
    });
}

describe('buyNow', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
  });

  it('cierra la subasta como vendida al precio de Compra ya', async () => {
    const res = await buyNowHandler(asBuyer());
    expect(res).toEqual({ ok: true, finalPrice: 34000 });

    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold');
    expect(a['winnerUid']).toBe(BUYER);
    expect(a['finalPrice']).toBe(34000);
    expect(a['paymentStatus']).toBe('pending_payment');
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('sold');
  });

  it('registra la compra en el historial de pujas', async () => {
    await buyNowHandler(asBuyer());
    const bids = await adminDb().collection(`auctions/${AUCTION}/bids`).get();
    expect(bids.size).toBe(1);
    expect(bids.docs[0]!.data()).toMatchObject({
      buyerUid: BUYER,
      amount: 34000,
      status: 'winning',
      source: 'buy_now',
    });
  });

  it('rechaza cuando ya hay pujas', async () => {
    await seed({ bidCount: 1, currentBid: 25500 });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza si la subasta no está live', async () => {
    await seed({ status: 'scheduled' });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza si ya venció', async () => {
    await seed({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza a un comprador de otra audiencia', async () => {
    await expect(buyNowHandler(asBuyer(BUYER, 'wholesale'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rechaza si la subasta no tiene precio de Compra ya', async () => {
    const ref = adminDb().doc(`auctions/${AUCTION}`);
    const { buyNowPrice: _omit, ...rest } = (await ref.get()).data()!;
    await ref.set(rest);
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza un auctionId con separadores de path', async () => {
    await expect(
      buyNowHandler(asBuyer(BUYER, 'retail', { auctionId: 'a1/bids/x' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('bajo compras concurrentes exactamente una gana', async () => {
    await adminDb()
      .doc('users/buyer-2')
      .set({
        email: 'b2@example.com',
        profile: {
          firstName: 'Ana',
          lastName: 'Gómez',
          audience: 'retail',
          documentType: 'CI',
          documentNumber: '7654321',
        },
      });
    const [r1, r2] = await Promise.allSettled([
      buyNowHandler(asBuyer(BUYER)),
      buyNowHandler(asBuyer('buyer-2')),
    ]);
    const ok = [r1, r2].filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['bidCount']).toBe(1);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test buyNow'`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `buyNow.ts`**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { loadAppConfig } from '../lib/config.js';
import { closeAuctionAsSold } from '../lib/close-auction.js';

const InputSchema = z.object({ auctionId: DocId });

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

export interface BuyNowResult {
  ok: true;
  finalPrice: number;
}

/**
 * Compra directa a precio fijo.
 *
 * Cierra la subasta al instante produciendo exactamente la misma transición
 * de documento que un cierre por vencimiento (status=ended, outcome=sold,
 * winnerUid), así que sendAuctionWon, la página /won, la subida de
 * comprobante y el barrido de vencimiento funcionan sin cambios.
 *
 * El botón desaparece del cliente con la primera puja, pero eso se revalida
 * acá: alguien puede tener la página vieja abierta.
 */
export async function buyNowHandler(req: CallableRequest): Promise<BuyNowResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer') {
    throw new HttpsError('permission-denied', 'Sólo un comprador puede usar Compra ya.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId } = parsed.data;

  const callerAudience = (req.auth!.token['audience'] as string | undefined) ?? 'retail';

  const db = adminDb();
  const cfg = await loadAppConfig().catch(() => null);
  const deadlineHours = cfg?.payment.deadlineHours ?? 24;
  const depositPercent = cfg?.payment.depositPercent ?? 0.1;

  const auctionRef = db.doc(`auctions/${auctionId}`);
  const rlRef = db.doc(`rate_limits/buynow_${uid}`);
  const userRef = db.doc(`users/${uid}`);

  const finalPrice = await db.runTransaction(async (tx) => {
    const now = Date.now();

    // Todas las lecturas primero.
    const rlSnap = await tx.get(rlRef);
    const aSnap = await tx.get(auctionRef);
    const uSnap = await tx.get(userRef);

    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError(
        'resource-exhausted',
        'Demasiados intentos. Probá de nuevo en un minuto.',
      );
    }

    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    const auctionAudience = (a['audience'] as string | undefined) ?? 'retail';
    if (auctionAudience !== callerAudience) {
      throw new HttpsError('permission-denied', 'Esta unidad no pertenece a tu catálogo.');
    }

    if (a['status'] !== 'live') {
      throw new HttpsError('failed-precondition', 'Esta subasta no está activa.');
    }
    const endsAt = a['endsAt'] as Timestamp;
    if (endsAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Esta subasta ya cerró.');
    }
    if (((a['bidCount'] as number) ?? 0) > 0) {
      throw new HttpsError(
        'failed-precondition',
        'Ya hay pujas en esta subasta: para participar tenés que pujar.',
      );
    }
    const buyNowPrice = a['buyNowPrice'] as number | undefined;
    if (buyNowPrice === undefined) {
      throw new HttpsError('failed-precondition', 'Esta subasta no admite compra directa.');
    }

    const profile = (uSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
    if (!profile['documentType'] || !profile['documentNumber']) {
      throw new HttpsError('failed-precondition', 'profile_incomplete');
    }

    const vehicleId = a['vehicleId'] as string | undefined;
    const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
    const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;

    // A partir de acá, sólo escrituras.
    closeAuctionAsSold(tx, {
      auctionRef,
      vehicleRef: vehicleSnap?.exists ? vehicleRef : null,
      winnerUid: uid,
      finalPrice: buyNowPrice,
      depositPercent,
      deadlineHours,
      nowMs: now,
    });

    tx.update(auctionRef, {
      currentBid: buyNowPrice,
      currentBidderUid: uid,
      bidCount: FieldValue.increment(1),
    });

    // Deja rastro en el historial: sin esto el panel de Pujas y el historial
    // del comprador mostrarían una venta sin ninguna operación detrás.
    const bidRef = auctionRef.collection('bids').doc();
    tx.set(bidRef, {
      id: bidRef.id,
      auctionId,
      buyerUid: uid,
      buyerSnapshot: {
        firstName: (profile['firstName'] as string) ?? '',
        lastInitial: ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?',
      },
      amount: buyNowPrice,
      createdAt: FieldValue.serverTimestamp(),
      status: 'winning',
      displacedBuyerUid: null,
      displacedAmount: null,
      source: 'buy_now',
    });

    tx.set(rlRef, { timestamps: [...recent, now] });

    return buyNowPrice;
  });

  await writeAuditLog({
    actorUid: uid,
    action: 'auction.buy_now',
    resourceType: 'auction',
    resourceId: auctionId,
    after: { finalPrice },
  }).catch((err) => console.error('[buyNow] audit log failed', err));

  return { ok: true, finalPrice };
}

export const buyNow = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  buyNowHandler,
);
```

- [ ] **Step 4: Exportar en `functions/src/index.ts`**

```ts
export { buyNow } from './auctions/buyNow.js';
```

- [ ] **Step 5: Correr los tests**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test buyNow'`
Expected: PASS, 9 tests.

- [ ] **Step 6: Suite completa y typecheck**

Run: `pnpm --filter @carbid/functions typecheck && firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`
Expected: todo PASS. `placeBid` sigue en 14/14 sin tocarse.

- [ ] **Step 7: Commit**

```bash
git add functions/src/auctions/buyNow.ts functions/src/auctions/buyNow.test.ts functions/src/index.ts
git commit -m "feat(auctions): buyNow callable"
```

---

## Task 5: Callable `markSoldOffline`

**Files:**

- Create: `functions/src/auctions/markSoldOffline.ts`
- Create: `functions/src/auctions/markSoldOffline.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**

- Consumes: `DocId`, `requireSignedIn`, `writeAuditLog`.
- Produces: `markSoldOfflineHandler(req): Promise<{ ok: true }>` y el export `markSoldOffline`. Input: `{ auctionId: string; soldPriceUsd: number }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/src/auctions/markSoldOffline.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { markSoldOfflineHandler } from './markSoldOffline.js';

const AUCTION = 'a1';

function asRole(role: string, data: Record<string, unknown> = {}) {
  return {
    auth: { uid: `${role}-uid`, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, soldPriceUsd: 28000, ...data },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'vehicles', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const subs = await d.collection('bids').listDocuments();
        await Promise.all(subs.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seed(overrides: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`auctions/${AUCTION}`)
    .set({
      vehicleId: 'v1',
      audience: 'retail',
      status: 'live',
      currentBid: 26000,
      currentBidderUid: 'buyer-1',
      bidCount: 1,
      endsAt: Timestamp.fromMillis(Date.now() + 86400_000),
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
      ...overrides,
    });
  await adminDb().doc('vehicles/v1').set({ status: 'in_auction' });
  await adminDb()
    .doc(`auctions/${AUCTION}/bids/b1`)
    .set({ auctionId: AUCTION, buyerUid: 'buyer-1', amount: 26000, status: 'winning' });
}

describe('markSoldOffline', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
  });

  it('marca la subasta como vendida fuera de plataforma', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold_offline');
    expect(a['soldOfflinePriceUsd']).toBe(28000);
    expect(a['soldOfflineBy']).toBe('staff-uid');
    expect(a['soldOfflineAt']).toBeDefined();
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('sold');
  });

  it('NO escribe ganador ni campos de pago', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['winnerUid']).toBeUndefined();
    expect(a['finalPrice']).toBeUndefined();
    expect(a['paymentStatus']).toBeUndefined();
    expect(a['paymentDeadline']).toBeUndefined();
  });

  it('marca las pujas activas como outbid', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const bids = await adminDb().collection(`auctions/${AUCTION}/bids`).get();
    expect(bids.docs.every((d) => d.data()['status'] === 'outbid')).toBe(true);
  });

  it('acepta staff y admin, rechaza buyer y finanzas', async () => {
    await markSoldOfflineHandler(asRole('admin'));
    await clearAll();
    await seed();
    await markSoldOfflineHandler(asRole('staff'));
    await clearAll();
    await seed();
    await expect(markSoldOfflineHandler(asRole('buyer'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(markSoldOfflineHandler(asRole('finanzas'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rechaza si la subasta ya está cerrada', async () => {
    await seed({ status: 'ended', outcome: 'sold' });
    await expect(markSoldOfflineHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza un precio no positivo', async () => {
    await expect(
      markSoldOfflineHandler(asRole('staff', { soldPriceUsd: 0 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('escribe log de auditoría', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.sold_offline')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('staff-uid');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test markSoldOffline'`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `markSoldOffline.ts`**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';

const MAX_PRICE_USD = 10_000_000;

const InputSchema = z.object({
  auctionId: DocId,
  soldPriceUsd: z.number().positive().finite().max(MAX_PRICE_USD),
});

export interface MarkSoldOfflineResult {
  ok: true;
}

/**
 * Marca una unidad como vendida fuera de la plataforma (salón).
 *
 * Deliberadamente NO reusa closeAuctionAsSold: esa función existe para
 * escribir los campos de dinero de una venta de plataforma —ganador, seña,
 * plazo— y acá no hay ninguno. Forzarla con banderas la convertiría en la
 * cosa que se quiso evitar al extraerla.
 *
 * El resultado `sold_offline` queda fuera del GMV a propósito: no hubo puja
 * ganadora ni pago que gestionar, y mezclarlo mentiría en los reportes.
 */
export async function markSoldOfflineHandler(req: CallableRequest): Promise<MarkSoldOfflineResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Sólo admin o staff pueden marcar una venta.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, soldPriceUsd } = parsed.data;

  const db = adminDb();
  const auctionRef = db.doc(`auctions/${auctionId}`);

  await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    const status = a['status'] as string;
    if (status !== 'live' && status !== 'scheduled') {
      throw new HttpsError('failed-precondition', 'Esta subasta ya está cerrada.');
    }

    const vehicleId = a['vehicleId'] as string | undefined;
    const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
    const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;

    const activeBids = await tx.get(auctionRef.collection('bids').where('status', '==', 'winning'));

    // Sólo escrituras a partir de acá.
    tx.update(auctionRef, {
      status: 'ended',
      outcome: 'sold_offline',
      soldOfflinePriceUsd: soldPriceUsd,
      soldOfflineAt: FieldValue.serverTimestamp(),
      soldOfflineBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (vehicleRef && vehicleSnap?.exists) {
      tx.update(vehicleRef, { status: 'sold', updatedAt: FieldValue.serverTimestamp() });
    }

    activeBids.forEach((d) => tx.update(d.ref, { status: 'outbid' }));
  });

  await writeAuditLog({
    actorUid: uid,
    action: 'auction.sold_offline',
    resourceType: 'auction',
    resourceId: auctionId,
    after: { soldPriceUsd },
  }).catch((err) => console.error('[markSoldOffline] audit log failed', err));

  return { ok: true };
}

export const markSoldOffline = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  markSoldOfflineHandler,
);
```

- [ ] **Step 4: Exportar en `functions/src/index.ts`**

```ts
export { markSoldOffline } from './auctions/markSoldOffline.js';
```

- [ ] **Step 5: Correr los tests**

Run: `firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test markSoldOffline'`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add functions/src/auctions/markSoldOffline.ts functions/src/auctions/markSoldOffline.test.ts functions/src/index.ts
git commit -m "feat(auctions): markSoldOffline callable"
```

---

## Task 6: Aviso interno de adjudicación

Cierra un hueco que ya existía: hoy nadie de Santa Rosa recibe aviso cuando se adjudica un auto.

**Files:**

- Create: `functions/src/notifications/sendAuctionSoldInternal.ts`
- Create: `functions/src/notifications/sendAuctionSoldInternal.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**

- Consumes: `sendEmail`, `RESEND_API_KEY` de `../lib/email.js`; `emailShell, body, badge, heading, sectionLabel, dataRows, statPair, esc` de `../lib/email-templates.js`.
- Produces: `buildInternalSoldEmail(args): { subject: string; html: string }` exportada para test, y el trigger `sendAuctionSoldInternal`.

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/src/notifications/sendAuctionSoldInternal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildInternalSoldEmail } from './sendAuctionSoldInternal.js';

describe('buildInternalSoldEmail', () => {
  const base = {
    vanity: 'RNW-ABC123',
    vehName: 'Toyota Hilux 2021',
    finalPrice: 34000,
    depositUsd: 3400,
    deadlineText: '9 de agosto, 18:00',
    buyerName: 'Juan Pérez',
    buyerEmail: 'juan@example.com',
    buyerPhone: '+595971000111',
    buyerDoc: 'CI 1234567',
    viaBuyNow: true,
  };

  it('etiqueta la compra directa', () => {
    const { subject, html } = buildInternalSoldEmail(base);
    expect(subject).toContain('Compra ya');
    expect(html).toContain('Compra ya');
  });

  it('etiqueta la subasta ganada', () => {
    const { subject, html } = buildInternalSoldEmail({ ...base, viaBuyNow: false });
    expect(subject).toContain('Subasta ganada');
    expect(html).toContain('Subasta ganada');
  });

  it('escapa el nombre del comprador', () => {
    const { html } = buildInternalSoldEmail({
      ...base,
      buyerName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('incluye seña y plazo, que es lo que administración necesita', () => {
    const { html } = buildInternalSoldEmail(base);
    expect(html).toContain('3.400');
    expect(html).toContain('9 de agosto, 18:00');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @carbid/functions test sendAuctionSoldInternal`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `sendAuctionSoldInternal.ts`**

```ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  sectionLabel,
  dataRows,
  ctaButton,
  esc,
  SITE_URL,
} from '../lib/email-templates.js';

/** Administración gestiona el cobro de la seña; siempre va en el aviso. */
const ADMIN_TO = 'administracion@santarosa.com.py';

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface InternalSoldEmailArgs {
  vanity: string;
  vehName: string;
  finalPrice: number;
  depositUsd: number;
  deadlineText: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDoc: string;
  viaBuyNow: boolean;
}

/**
 * Arma el correo. Separado del trigger para poder testear el contenido sin
 * emulador de Firestore ni red.
 */
export function buildInternalSoldEmail(a: InternalSoldEmailArgs): {
  subject: string;
  html: string;
} {
  const via = a.viaBuyNow ? 'Compra ya' : 'Subasta ganada';
  const html = emailShell(
    body(
      badge(via, a.viaBuyNow ? 'info' : 'success') +
        heading(
          a.vehName,
          `Se adjudicó una unidad por <strong style="color:#0a0a0a;">${esc(via)}</strong>. Administración debe gestionar el cobro de la seña.`,
        ) +
        `<p style="margin:6px 0 0;font-size:12px;color:#71717a;font-weight:700;letter-spacing:0.5px;">Subasta ${esc(a.vanity)}</p>` +
        statPair(
          { label: 'Precio final', value: `USD ${fmtUsd(a.finalPrice)}` },
          { label: 'Seña esperada', value: `USD ${fmtUsd(a.depositUsd)}`, strong: true },
        ) +
        sectionLabel('Comprador') +
        dataRows([
          ['Nombre', esc(a.buyerName)],
          ['Email', esc(a.buyerEmail)],
          ['Teléfono', esc(a.buyerPhone)],
          ['Documento', esc(a.buyerDoc)],
        ]) +
        sectionLabel('Plazo') +
        dataRows([['Vence', esc(a.deadlineText)]]) +
        ctaButton(`${SITE_URL}/es/staff/auctions`, 'Abrir en el panel'),
    ),
  );
  return { subject: `${via} · ${a.vehName} · ${a.vanity}`, html };
}

/**
 * Avisa internamente cuando se adjudica una unidad.
 *
 * Dispara sobre la MISMA transición que sendAuctionWon (ended + sold +
 * winnerUid), así cubre tanto Compra ya como una subasta ganada por
 * vencimiento. Antes de esto nadie del lado interno se enteraba hasta que el
 * comprador subía el comprobante — y si nunca lo subía, nunca.
 *
 * Best-effort: la venta ya está escrita cuando esto corre; un correo caído
 * no puede tumbarla.
 */
export const sendAuctionSoldInternal = onDocumentUpdated(
  { document: 'auctions/{auctionId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const wasSold = before['status'] === 'ended' && before['outcome'] === 'sold';
    const isSold = after['status'] === 'ended' && after['outcome'] === 'sold';
    if (wasSold || !isSold) return;

    const winnerUid = after['winnerUid'] as string | undefined;
    if (!winnerUid) return;

    try {
      const auctionId = event.params['auctionId'] as string;
      const uSnap = await adminDb().doc(`users/${winnerUid}`).get();
      const u = uSnap.data() ?? {};
      const profile = (u['profile'] ?? {}) as Record<string, unknown>;
      const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

      const deadline = after['paymentDeadline'] as Timestamp | undefined;
      const deadlineText = deadline
        ? deadline.toDate().toLocaleString('es-PY', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'a confirmar';

      const docType = (profile['documentType'] as string) ?? '';
      const docNumber = (profile['documentNumber'] as string) ?? '';

      const { subject, html } = buildInternalSoldEmail({
        vanity: `RNW-${auctionId.slice(-6).toUpperCase()}`,
        vehName:
          `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`.trim(),
        finalPrice: (after['finalPrice'] as number) ?? 0,
        depositUsd: (after['paymentDepositUsd'] as number) ?? 0,
        deadlineText,
        buyerName:
          `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim(),
        buyerEmail: (u['email'] as string) ?? '',
        buyerPhone: (profile['phone'] as string) ?? '',
        buyerDoc: docType && docNumber ? `${docType} ${docNumber}` : '',
        // Buy Now escribe un bid con source 'buy_now'; su ausencia significa
        // que se ganó pujando.
        viaBuyNow: !(await adminDb()
          .collection(`auctions/${auctionId}/bids`)
          .where('source', '==', 'buy_now')
          .limit(1)
          .get()
          .then((s) => s.empty)),
      });

      // Administración fija + todo admin/staff activo.
      const staffSnap = await adminDb()
        .collection('users')
        .where('role', 'in', ['admin', 'staff'])
        .where('status', '==', 'active')
        .get();
      const recipients = Array.from(
        new Set([
          ADMIN_TO,
          ...staffSnap.docs
            .map((d) => d.data()['email'] as string | undefined)
            .filter((e): e is string => !!e),
        ]),
      );

      for (const to of recipients) {
        await sendEmail({ to, subject, html });
      }
    } catch (err) {
      console.error('[sendAuctionSoldInternal] failed (non-fatal)', err);
    }
  },
);
```

- [ ] **Step 4: Exportar en `functions/src/index.ts`**

```ts
export { sendAuctionSoldInternal } from './notifications/sendAuctionSoldInternal.js';
```

- [ ] **Step 5: Correr los tests**

Run: `pnpm --filter @carbid/functions test sendAuctionSoldInternal`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add functions/src/notifications/sendAuctionSoldInternal.ts functions/src/notifications/sendAuctionSoldInternal.test.ts functions/src/index.ts
git commit -m "feat(notifications): internal email when an auction is adjudicated"
```

---

## Task 7: Aviso a los postores de una venta en salón

**Files:**

- Create: `functions/src/notifications/sendAuctionSoldOffline.ts`
- Create: `functions/src/notifications/sendAuctionSoldOffline.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**

- Consumes: `recordNotification` de `../lib/notify.js`, `esc` de `../lib/email-templates.js`.
- Produces: `buildSoldOfflineEmail({ vehName, bidderFirstName }): { subject: string; html: string }` y el trigger `sendAuctionSoldOffline`.

- [ ] **Step 1: Escribir el test que falla**

Crear `functions/src/notifications/sendAuctionSoldOffline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSoldOfflineEmail } from './sendAuctionSoldOffline.js';

describe('buildSoldOfflineEmail', () => {
  it('explica que la unidad se vendió en salón', () => {
    const { subject, html } = buildSoldOfflineEmail({
      vehName: 'Toyota Hilux 2021',
      bidderFirstName: 'Juan',
    });
    expect(subject).toContain('Toyota Hilux 2021');
    expect(html).toContain('Juan');
    expect(html).toContain('salón');
  });

  it('escapa el nombre del postor', () => {
    const { html } = buildSoldOfflineEmail({
      vehName: 'Toyota Hilux 2021',
      bidderFirstName: '<b>x</b>',
    });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @carbid/functions test sendAuctionSoldOffline`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `sendAuctionSoldOffline.ts`**

```ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import { recordNotification } from '../lib/notify.js';
import { emailShell, body, badge, heading, callout, esc } from '../lib/email-templates.js';

export function buildSoldOfflineEmail({
  vehName,
  bidderFirstName,
}: {
  vehName: string;
  bidderFirstName: string;
}): { subject: string; html: string } {
  const html = emailShell(
    body(
      badge('Subasta finalizada', 'neutral') +
        heading(
          `Hola, ${esc(bidderFirstName)}`,
          `La unidad <strong style="color:#0a0a0a;">${esc(vehName)}</strong> por la que habías pujado se vendió en nuestro salón, así que la subasta se cerró antes de tiempo.`,
        ) +
        callout(
          'Lamentamos el inconveniente. Tu puja no genera ningún cargo. Seguí atento: publicamos lotes nuevos con frecuencia.',
          'neutral',
        ),
    ),
  );
  return { subject: `Subasta finalizada · ${vehName}`, html };
}

/**
 * Avisa a quienes habían pujado cuando la unidad se vendió en salón.
 *
 * Los términos publicados dicen que las pujas son firmes y que se adjudica
 * al cierre, así que cerrar por una venta externa exige explicárselo a quien
 * se había comprometido. No avisar sería la opción barata y la peor.
 */
export const sendAuctionSoldOffline = onDocumentUpdated(
  { document: 'auctions/{auctionId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before['outcome'] === 'sold_offline' || after['outcome'] !== 'sold_offline') return;

    const auctionId = event.params['auctionId'] as string;
    const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const vehName =
      `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`.trim();

    try {
      const bidsSnap = await adminDb().collection(`auctions/${auctionId}/bids`).get();
      const uids = Array.from(
        new Set(
          bidsSnap.docs
            .map((d) => d.data()['buyerUid'] as string | undefined)
            .filter((u): u is string => !!u),
        ),
      );
      if (uids.length === 0) return;

      for (const uid of uids) {
        const uSnap = await adminDb().doc(`users/${uid}`).get();
        const u = uSnap.data() ?? {};
        const email = u['email'] as string | undefined;
        if (!email) continue;
        const profile = (u['profile'] ?? {}) as Record<string, unknown>;
        const { subject, html } = buildSoldOfflineEmail({
          vehName,
          bidderFirstName: (profile['firstName'] as string) ?? '',
        });
        const result = await sendEmail({ to: email, subject, html });
        await recordNotification({
          type: 'auction_sold_offline',
          toUid: uid,
          toEmail: email,
          auctionId,
          bidId: null,
          result,
        });
      }
    } catch (err) {
      console.error('[sendAuctionSoldOffline] failed (non-fatal)', err);
    }
  },
);
```

Si la firma de `recordNotification` no acepta `bidId: null` o el `type` no está en su unión, ampliarla en `functions/src/lib/notify.ts` agregando `'auction_sold_offline'` al tipo.

- [ ] **Step 4: Exportar en `functions/src/index.ts`**

```ts
export { sendAuctionSoldOffline } from './notifications/sendAuctionSoldOffline.js';
```

- [ ] **Step 5: Correr los tests y la suite**

Run: `pnpm --filter @carbid/functions typecheck && firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`
Expected: todo PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/notifications/sendAuctionSoldOffline.ts functions/src/notifications/sendAuctionSoldOffline.test.ts functions/src/lib/notify.ts functions/src/index.ts
git commit -m "feat(notifications): email bidders when a unit is sold offline"
```

---

## Task 8: Loaders — GMV, finanzas y catálogo

**Files:**

- Modify: `apps/web/src/lib/admin/load-dashboard-stats.ts`
- Modify: el loader del panel de finanzas (`apps/web/src/lib/**` que filtra `outcome === 'sold'`; localizarlo con el grep del Step 1)
- Modify: `apps/web/src/lib/buyer/list-public-auctions.ts`

**Interfaces:**

- Consumes: outcome `sold_offline` de Task 2.
- Produces: `PublicAuction` gana `outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline' | null`.

- [ ] **Step 1: Localizar todos los puntos que filtran por venta**

Run: `grep -rn "outcome" apps/web/src/lib --include="*.ts"`
Anotar cada archivo que compare contra `'sold'`. Deben quedar todos revisados al terminar la tarea.

- [ ] **Step 2: Confirmar que GMV y finanzas siguen usando sólo `'sold'`**

Ninguno de esos dos debe incluir `sold_offline`. Si alguno usa un filtro laxo del tipo `outcome !== 'no_bids'`, ajustarlo a igualdad estricta contra `'sold'`. Comentario a dejar en el sitio:

```ts
// Sólo ventas de plataforma. `sold_offline` se excluye a propósito: no hubo
// puja ganadora ni seña que gestionar, y sumarla inflaría el GMV.
```

- [ ] **Step 3: Exponer el outcome en el catálogo público**

En `apps/web/src/lib/buyer/list-public-auctions.ts`, agregar a la interfaz `PublicAuction`:

```ts
outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline' | null;
```

y en `toItem`:

```ts
    outcome: (data['outcome'] as PublicAuction['outcome']) ?? null,
```

- [ ] **Step 4: Incluir las vendidas hasta el cierre del lote**

En la rama `else` de la query (`tab !== 'closing'`), reemplazar el filtro de status por uno que también traiga las cerradas cuyo `endsAt` todavía no venció:

```ts
// Las vendidas siguen visibles con su franja hasta que el lote al que
// pertenecían vence — sirve de prueba social de que se venden autos.
// Firestore no admite OR sobre campos distintos en una sola query, así
// que se traen ambos conjuntos y se ordenan en memoria (el lote es de
// decenas de unidades, no miles).
const [openSnap, soldSnap] = await Promise.all([
  db
    .collection('auctions')
    .where('audience', '==', audience)
    .where('status', 'in', ['live', 'scheduled'])
    .orderBy('endsAt', 'asc')
    .limit(pageSize)
    .get(),
  db
    .collection('auctions')
    .where('audience', '==', audience)
    .where('status', '==', 'ended')
    .where('endsAt', '>', new Date())
    .orderBy('endsAt', 'asc')
    .limit(pageSize)
    .get(),
]);
return [...openSnap.docs, ...soldSnap.docs]
  .map(toItem)
  .filter((a) => a.status !== 'ended' || a.outcome === 'sold' || a.outcome === 'sold_offline')
  .sort((a, b) => a.endsAtMs - b.endsAtMs)
  .slice(0, pageSize);
```

- [ ] **Step 5: Verificar el índice**

Run: `pnpm --filter @carbid/web build`
Si al ejecutar contra el emulador Firestore pide un índice compuesto para `audience + status + endsAt`, agregarlo a `firestore.indexes.json` y validarlo con:
`firebase deploy --only firestore:indexes --project carbid-staging --dry-run`

- [ ] **Step 6: Typecheck y commit**

Run: `pnpm --filter @carbid/web typecheck`

```bash
git add apps/web/src/lib firestore.indexes.json
git commit -m "feat(web): keep sold units visible until the lote closes; exclude sold_offline from GMV"
```

---

## Task 9: `SoldBanner` y botón Compra ya

**Files:**

- Create: `apps/web/src/components/auctions/sold-banner.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx`
- Modify: `apps/web/src/components/public/public-auction-card.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/auctions/[id]/bid-panel.tsx`

**Interfaces:**

- Consumes: `PublicAuction.outcome` (Task 8), callable `buyNow` (Task 4).
- Produces: `<SoldBanner variant="card" | "detail" />`.

- [ ] **Step 1: Crear el componente**

Crear `apps/web/src/components/auctions/sold-banner.tsx`:

```tsx
interface Props {
  /** `card` = diagonal sobre la foto; `detail` = barra de ancho completo. */
  variant: 'card' | 'detail';
}

/**
 * Marca VENDIDO.
 *
 * Se muestra igual para `sold` y `sold_offline`: un auto vendido es un auto
 * vendido, y distinguir el canal en la vitrina no le sirve a nadie de afuera.
 * La diferencia sólo importa en los reportes.
 */
export function SoldBanner({ variant }: Props) {
  if (variant === 'detail') {
    return (
      <div
        role="status"
        className="w-full rounded-xl bg-rose-600 px-4 py-3 text-center text-lg font-bold uppercase tracking-[0.2em] text-white"
      >
        Vendido
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={
          'absolute left-[-30%] top-[38%] w-[160%] rotate-[-12deg] ' +
          'bg-rose-600/95 py-1.5 text-center text-sm font-bold uppercase ' +
          'tracking-[0.25em] text-white shadow-lg'
        }
      >
        Vendido
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Usarlo en ambas tarjetas**

En `auction-card.tsx` y `public-auction-card.tsx`, dentro del contenedor de la foto (el `div` con `aspect-[4/3]`, que ya es `relative`), después del gradiente:

```tsx
{
  (auction.outcome === 'sold' || auction.outcome === 'sold_offline') && (
    <SoldBanner variant="card" />
  );
}
```

Agregar el import correspondiente. En la tarjeta pública, además, ocultar el botón "Pujar" cuando esté vendida — reemplazarlo por texto muerto:

```tsx
        {auction.outcome === 'sold' || auction.outcome === 'sold_offline' ? (
          <p className="relative z-[2] mt-auto w-full text-center text-sm text-text-muted">
            Ya no disponible
          </p>
        ) : (
          /* el <Link> de Pujar que ya existe */
        )}
```

- [ ] **Step 3: Agregar el botón Compra ya al bid-panel**

En `bid-panel.tsx`, antes del formulario de puja, cuando `auction.buyNowPrice` existe y `auction.bidCount === 0`:

```tsx
      <div className="rounded-xl border border-copper/30 bg-copper/[0.06] p-4 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
            Compra ya
          </p>
          <p className="mt-0.5 text-2xl font-semibold num-tab tracking-tight text-text-strong">
            USD {buyNowPrice.toLocaleString('es-PY')}
          </p>
        </div>
        <Button type="button" className="w-full" onClick={() => setConfirmBuyNow(true)}>
          Comprar ahora
        </Button>
        <p className="text-xs text-text-muted">Cerrás la compra al instante.</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-text-subtle/20" />o pujá
        <span className="h-px flex-1 bg-text-subtle/20" />
      </div>
```

- [ ] **Step 4: Diálogo de confirmación**

Reusar el `Dialog` que el panel ya usa para confirmar pujas. Estado `confirmBuyNow: boolean`, y al aceptar:

```tsx
async function doBuyNow() {
  setBusy(true);
  try {
    await httpsCallable(fb.functions, 'buyNow')({ auctionId });
    toast.success('¡Compra confirmada! Revisá tu correo para abonar la seña.');
    router.refresh();
  } catch (e) {
    toast.error((e as Error).message ?? 'No se pudo completar la compra.');
  } finally {
    setBusy(false);
    setConfirmBuyNow(false);
  }
}
```

Texto del diálogo, con el vehículo y el precio explícitos porque un click accidental cuesta miles de dólares:

> Vas a comprar el {make} {model} {year} por USD {precio}. La subasta cierra al instante y tenés 24 h para abonar la seña.

- [ ] **Step 5: Verificar en el navegador**

Levantar emuladores y `web-emulators`, sembrar una subasta con `buyNowPrice` y `bidCount: 0`, y comprobar:

1. El bloque Compra ya aparece.
2. Con `bidCount: 1` desaparece.
3. Al comprar, la página pasa al estado ganado.
4. Con `outcome: 'sold_offline'`, la tarjeta muestra la franja y no ofrece pujar.

- [ ] **Step 6: Typecheck, lint y commit**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint`

```bash
git add apps/web/src/components/auctions/sold-banner.tsx apps/web/src/components/public/public-auction-card.tsx "apps/web/src/app/[locale]/(protected)/auctions"
git commit -m "feat(web): Compra ya button + VENDIDO banner"
```

---

## Task 10: UI de staff — precio de Compra ya y marcar VENDIDO

**Files:**

- Create: `apps/web/src/app/[locale]/(protected)/staff/auctions/[id]/mark-sold-dialog.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/staff/auctions/[id]/auction-detail-view.tsx`

**Interfaces:**

- Consumes: callable `markSoldOffline` (Task 5), `updateAuction` con `buyNowPrice` (Task 3).
- Produces: `<MarkSoldDialog auctionId bidCount onDone />`.

- [ ] **Step 1: Crear el diálogo**

Crear `mark-sold-dialog.tsx`. Puntos no negociables:

```tsx
// Confirmación tipeada, igual que el borrado de cuenta: cerrar una subasta
// con pujas activas no puede depender de un solo click.
const CONFIRM_WORD = 'VENDIDO';
```

y la advertencia, sólo cuando hay pujas:

```tsx
{
  bidCount > 0 && (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="text-sm text-amber-200/90">
        Esta subasta tiene <strong>{bidCount}</strong>{' '}
        {bidCount === 1 ? 'puja activa' : 'pujas activas'}. Al marcarla vendida, se les avisa por
        correo que la unidad se vendió en salón.
      </p>
    </div>
  );
}
```

Campos: precio real (`type="number"`, requerido, > 0) y la confirmación tipeada. Submit deshabilitado hasta que ambos sean válidos. Al confirmar:

```tsx
await httpsCallable(fb.functions, 'markSoldOffline')({ auctionId, soldPriceUsd: Number(price) });
```

- [ ] **Step 2: Montarlo en la vista de staff**

En `auction-detail-view.tsx`, junto al botón Cancelar:

```tsx
{
  canManage && (status === 'live' || status === 'scheduled') && (
    <MarkSoldDialog auctionId={initial.id} bidCount={bidCount} onDone={() => router.refresh()} />
  );
}
```

`canManage` ya cubre admin y staff en ese archivo — verificar que así sea y, si no, ajustar para que ambos roles lo vean.

- [ ] **Step 3: Agregar el campo de precio Compra ya al form de edición**

Junto al input de reserva, con etiquetas que digan explícitamente qué se ve y qué no:

```tsx
<div className="space-y-2">
  <Label htmlFor="buyNow">Precio Compra ya</Label>
  <Input id="buyNow" type="number" value={fBuyNow} onChange={(e) => setFBuyNow(e.target.value)} />
  <p className="text-xs text-text-muted">
    Visible para los compradores · opcional · debe superar el precio objetivo
  </p>
</div>
```

Y la validación en vivo antes de enviar:

```tsx
const buyNowInvalid =
  fBuyNow.trim() !== '' && fReserve.trim() !== '' && Number(fBuyNow) <= Number(fReserve);
```

Mostrar el error inline y deshabilitar el submit mientras `buyNowInvalid` sea true. En el payload: `''` → `null`, número → número.

Etiquetar también el input de reserva como **no visible para compradores**, porque confundirlos sería caro.

- [ ] **Step 4: Verificar en el navegador**

Como staff: cargar `buyNowPrice` menor a la reserva y confirmar que el submit queda bloqueado con el mensaje; cargar uno mayor y confirmar que persiste. Marcar VENDIDO en una subasta con pujas y confirmar que aparece la advertencia con el número correcto.

- [ ] **Step 5: Typecheck, lint, suite completa y commit**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`

```bash
git add "apps/web/src/app/[locale]/(protected)/staff/auctions"
git commit -m "feat(staff): buy-now price field + mark-sold-offline dialog"
```

---

## Task 11: Verificación integral y deploy

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa de functions**

Run: `pnpm --filter @carbid/functions typecheck && firebase emulators:exec --only auth,firestore --project carbid-test 'pnpm --filter @carbid/functions test'`
Expected: todo PASS. `placeBid` sigue en 14/14 — la señal de que no se tocó lo sensible.

- [ ] **Step 2: Web completo**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test && pnpm --filter @carbid/web build`
Expected: todo PASS.

- [ ] **Step 3: Recorrido manual con emuladores**

1. Comprar con Compra ya → llega el correo al ganador y el aviso interno.
2. Marcar VENDIDO con pujas → llega el aviso a los postores.
3. El dashboard admin NO cuenta la venta de salón en el GMV.
4. La unidad vendida sigue visible con la franja hasta que su `endsAt` pasa.

- [ ] **Step 4: Reglas e índices**

Run: `firebase deploy --only firestore:rules,firestore:indexes,storage --project carbid-staging --dry-run`
Expected: compila limpio.

- [ ] **Step 5: Deploy**

Las reglas y las functions se despliegan a `carbid-staging`, que **es producción** (ver `.github/workflows/README.md`). El web se despliega solo al pushear a `main`. Desplegar backend primero:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes --project carbid-staging
git push origin main
```

- [ ] **Step 6: Verificar en producción**

Confirmar que el deploy de Netlify quedó `ready` con el commit correcto, y que `/es` responde 200 con las unidades del lote.
