# Auction Insights (reporte admin/staff) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-vehicle insights report for admin/staff: who views each auction, price-change history (flagging reductions), and a 7-days-unsold alert (daily email digest + live badge).

**Architecture:** A `logAuctionView` callable (fired by an invisible client tracker, throttled) upserts `auctions/{id}/viewers/{uid}` and increments `viewStats` aggregates. A hook inside `updateAuction` records every price edit into `auctions/{id}/priceChanges`. `createAuction` stamps `vehicles/{id}.firstListedAt` once. A daily scheduler emails admin+staff about vehicles ≥7 days unsold (idempotent via `unsoldAlertAt`). New `/staff/insights` pages read everything server-side with the Admin SDK.

**Tech Stack:** Firebase Cloud Functions v2 (onCall/onSchedule), Firestore, Zod, Vitest (emulator-backed), Next.js 14 App Router (server components + one client tracker), Resend email, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-21-auction-insights-design.md`
**Branch:** `feat/auction-insights`

---

## File Structure

**Shared types:**

- Modify `packages/shared-types/src/auction.ts` — optional `viewStats`.
- Modify `packages/shared-types/src/vehicle.ts` — optional `firstListedAt`, `unsoldAlertAt`.
- Modify `functions/src/_shared/auction.ts` + `functions/src/_shared/vehicle.ts` — mirrors.

**Functions:**

- Create `functions/src/insights/logAuctionView.ts` (+ test) — view-tracking callable.
- Create `functions/src/insights/dailyUnsoldDigest.ts` (+ test) — 7-day scheduler + email.
- Modify `functions/src/auctions/updateAuction.ts` (+ test) — priceChanges hook.
- Modify `functions/src/auctions/createAuction.ts` (+ test) — firstListedAt stamp.
- Modify `functions/src/index.ts` — export the two new functions.

**Rules:**

- Modify `firestore.rules` — `viewers` + `priceChanges` subcollection reads.

**Web:**

- Create `apps/web/src/lib/insights/load-insights.ts` — list loader (server-only).
- Create `apps/web/src/lib/insights/load-vehicle-insight.ts` — detail loader (server-only).
- Create `apps/web/src/components/insights/view-tracker.tsx` — invisible client tracker.
- Modify `apps/web/src/app/[locale]/(protected)/auctions/[id]/page.tsx` — mount tracker.
- Create `apps/web/src/app/[locale]/(protected)/staff/insights/page.tsx` — report list.
- Create `apps/web/src/app/[locale]/(protected)/staff/insights/[vehicleId]/page.tsx` — drill-down.
- Modify `apps/web/src/components/shell/nav-config.ts` + `sidebar-nav.tsx` — "Reporte" entry + `chart` icon.

---

## Prerequisites

- Branch `feat/auction-insights` (already checked out; includes the a11y commit).
- Functions tests need the emulators running: `pnpm emulators` in a separate terminal, leave it up for every `@carbid/functions` test step.
- Staff UI text is hardcoded Spanish in this repo (see `staff/bids/page.tsx`) — follow that; no i18n keys for staff pages.

---

## Task 1: Schema fields (viewStats, firstListedAt, unsoldAlertAt)

**Files:**

- Modify: `packages/shared-types/src/auction.ts` (inside `AuctionSchema`)
- Modify: `packages/shared-types/src/vehicle.ts` (inside `VehicleSchema`)
- Modify: `functions/src/_shared/auction.ts` + `functions/src/_shared/vehicle.ts` (mirrors)
- Test: `packages/shared-types/src/insights.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared-types/src/insights.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AuctionSchema } from './auction.js';
import { VehicleSchema } from './vehicle.js';

const baseAuction = {
  id: 'a1',
  vehicleId: 'v1',
  vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
  startingPrice: 5000,
  bidIncrement: 100,
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3600_000),
  currentBid: 0,
  bidCount: 0,
  status: 'live' as const,
  createdBy: 'staff-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('insights schema fields', () => {
  it('AuctionSchema accepts optional viewStats', () => {
    expect(AuctionSchema.safeParse(baseAuction).success).toBe(true);
    expect(
      AuctionSchema.safeParse({ ...baseAuction, viewStats: { total: 12, unique: 5 } }).success,
    ).toBe(true);
  });

  it('VehicleSchema accepts optional firstListedAt/unsoldAlertAt', () => {
    const parsed = VehicleSchema.shape.firstListedAt?.safeParse(new Date());
    expect(parsed?.success).toBe(true);
    const parsed2 = VehicleSchema.shape.unsoldAlertAt?.safeParse(undefined);
    expect(parsed2?.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carbid/shared-types test insights`
Expected: FAIL — `viewStats` unknown key rejected / `shape.firstListedAt` undefined.

- [ ] **Step 3: Add the fields (canonical)**

In `packages/shared-types/src/auction.ts`, inside `AuctionSchema` (after `bidCount`):

```ts
  /** Aggregated viewer counters, maintained by the logAuctionView callable. */
  viewStats: z.object({ total: z.number().int().nonnegative(), unique: z.number().int().nonnegative() }).optional(),
```

In `packages/shared-types/src/vehicle.ts`, inside `VehicleSchema` (after `createdAt`):

```ts
  /** Stamped when the vehicle's FIRST auction is created — anchor for the 7-day unsold alert. */
  firstListedAt: z.date().optional(),
  /** Set once the 7-day unsold digest email included this vehicle (idempotency mark). */
  unsoldAlertAt: z.date().optional(),
```

- [ ] **Step 4: Mirror both changes in `functions/src/_shared/auction.ts` and `functions/src/_shared/vehicle.ts`** (identical lines in their respective schemas).

- [ ] **Step 5: Build + run tests**

Run: `pnpm --filter @carbid/shared-types build && pnpm --filter @carbid/shared-types test && pnpm --filter @carbid/functions typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/auction.ts packages/shared-types/src/vehicle.ts packages/shared-types/src/insights.test.ts functions/src/_shared/auction.ts functions/src/_shared/vehicle.ts
git commit -m "feat(schema): viewStats + firstListedAt/unsoldAlertAt for insights"
```

---

## Task 2: `logAuctionView` callable

**Files:**

- Create: `functions/src/insights/logAuctionView.ts`
- Test: `functions/src/insights/logAuctionView.test.ts`
- Modify: `functions/src/index.ts` (export at the end of the auth/auction exports)

- [ ] **Step 1: Write the failing test**

Create `functions/src/insights/logAuctionView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { logAuctionViewHandler } from './logAuctionView.js';

function asBuyer(uid: string, auctionId: string): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data: { auctionId },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const sub = await d.collection('viewers').listDocuments();
        await Promise.all(sub.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seedAuction(id = 'a1') {
  await adminDb()
    .doc(`auctions/${id}`)
    .set({
      id,
      vehicleId: 'v1',
      status: 'live',
      startsAt: Timestamp.now(),
      endsAt: Timestamp.fromMillis(Date.now() + 3600_000),
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function seedBuyer(uid: string) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      status: 'active',
      profile: { firstName: 'Ana', lastName: 'Gomez' },
    });
}

describe('logAuctionView', () => {
  beforeEach(clearAll);

  it('first view creates viewer doc and sets aggregates', async () => {
    await seedAuction();
    await seedBuyer('b1');
    const res = await logAuctionViewHandler(asBuyer('b1', 'a1'));
    expect(res).toEqual({ ok: true, logged: true });

    const viewer = (await adminDb().doc('auctions/a1/viewers/b1').get()).data()!;
    expect(viewer['viewCount']).toBe(1);
    expect(viewer['firstName']).toBe('Ana');
    expect(viewer['lastInitial']).toBe('G');

    const a = (await adminDb().doc('auctions/a1').get()).data()!;
    expect(a['viewStats']).toEqual({ total: 1, unique: 1 });
  });

  it('repeat view increments total + viewCount but not unique', async () => {
    await seedAuction();
    await seedBuyer('b1');
    await logAuctionViewHandler(asBuyer('b1', 'a1'));
    await logAuctionViewHandler(asBuyer('b1', 'a1'));

    const viewer = (await adminDb().doc('auctions/a1/viewers/b1').get()).data()!;
    expect(viewer['viewCount']).toBe(2);
    const a = (await adminDb().doc('auctions/a1').get()).data()!;
    expect(a['viewStats']).toEqual({ total: 2, unique: 1 });
  });

  it('staff/admin/finanzas views are a no-op', async () => {
    await seedAuction();
    for (const role of ['staff', 'admin', 'finanzas'] as const) {
      const req = {
        auth: { uid: `${role}-1`, token: { role, status: 'active' } as never },
        rawRequest: {} as never,
        data: { auctionId: 'a1' },
      } as CallableRequest;
      const res = await logAuctionViewHandler(req);
      expect(res).toEqual({ ok: true, logged: false });
    }
    const viewers = await adminDb().collection('auctions/a1/viewers').listDocuments();
    expect(viewers.length).toBe(0);
  });

  it('rejects unknown auction', async () => {
    await seedBuyer('b1');
    await expect(logAuctionViewHandler(asBuyer('b1', 'nope'))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects unauthenticated', async () => {
    const req = { rawRequest: {} as never, data: { auctionId: 'a1' } } as CallableRequest;
    await expect(logAuctionViewHandler(req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rate limits a hostile client (max 20/min)', async () => {
    await seedAuction();
    await seedBuyer('b1');
    for (let i = 0; i < 20; i++) {
      await logAuctionViewHandler(asBuyer('b1', 'a1'));
    }
    await expect(logAuctionViewHandler(asBuyer('b1', 'a1'))).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carbid/functions test logAuctionView`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the callable**

Create `functions/src/insights/logAuctionView.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';

const InputSchema = z.object({ auctionId: z.string().min(1).max(64) });

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

export interface LogAuctionViewResult {
  ok: true;
  /** false when the caller is internal staff (views intentionally not recorded). */
  logged: boolean;
}

/**
 * Records a buyer's visit to an auction detail page.
 *
 * - Buyers only: admin/staff/finanzas views are a no-op — the report is about
 *   real demand, not internal browsing.
 * - Aggregates live on the auction doc (`viewStats.total/unique`) so the list
 *   report never has to fan out over subcollections.
 * - Server-side rate limit (20/min per user) so a hostile client can't inflate
 *   counters; the well-behaved client additionally throttles via sessionStorage.
 */
export async function logAuctionViewHandler(req: CallableRequest): Promise<LogAuctionViewResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer') {
    return { ok: true, logged: false };
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId } = parsed.data;

  const db = adminDb();
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const viewerRef = auctionRef.collection('viewers').doc(uid);
  const rlRef = db.doc(`rate_limits/views_${uid}`);
  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
  const firstName = (profile['firstName'] as string) ?? '';
  const lastInitial = ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?';

  await db.runTransaction(async (tx) => {
    const now = Date.now();

    // Rate limit inside the transaction (same pattern as placeBid).
    const rlSnap = await tx.get(rlRef);
    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'View rate limit exceeded');
    }

    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');

    const vSnap = await tx.get(viewerRef);
    const isNewViewer = !vSnap.exists;

    tx.set(rlRef, { timestamps: [...recent, now] });

    if (isNewViewer) {
      tx.set(viewerRef, {
        uid,
        firstName,
        lastInitial,
        firstViewAt: FieldValue.serverTimestamp(),
        lastViewAt: FieldValue.serverTimestamp(),
        viewCount: 1,
      });
    } else {
      tx.update(viewerRef, {
        lastViewAt: FieldValue.serverTimestamp(),
        viewCount: FieldValue.increment(1),
      });
    }

    tx.update(auctionRef, {
      'viewStats.total': FieldValue.increment(1),
      ...(isNewViewer ? { 'viewStats.unique': FieldValue.increment(1) } : {}),
    });
  });

  return { ok: true, logged: true };
}

export const logAuctionView = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  logAuctionViewHandler,
);
```

> Note: `tx.update(auctionRef, {'viewStats.total': increment})` fails if the doc has no `viewStats` map on some SDK versions? No — dot-path update with `FieldValue.increment` creates the nested map when missing. If the test's first-view case fails with "no viewStats", switch to `tx.set(auctionRef, { viewStats: {...} }, { merge: true })` reading current values from `aSnap` — but try the increment form first; it is the standard behavior.

- [ ] **Step 4: Export in `functions/src/index.ts`**

After the last auction export, add:

```ts
export { logAuctionView } from './insights/logAuctionView.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @carbid/functions test logAuctionView`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/insights/logAuctionView.ts functions/src/insights/logAuctionView.test.ts functions/src/index.ts
git commit -m "feat(insights): logAuctionView callable with aggregates + rate limit"
```

---

## Task 3: priceChanges hook in `updateAuction`

**Files:**

- Modify: `functions/src/auctions/updateAuction.ts` (after `await ref.update(update);`, ~line 147)
- Test: `functions/src/auctions/updateAuction.test.ts` (add cases; file exists? if NOT, create with the cases below plus the imports/helpers shown)

- [ ] **Step 1: Check whether `updateAuction.test.ts` exists**

Run: `ls functions/src/auctions/updateAuction.test.ts`
If missing, create it with the scaffold below (helpers mirror `placeBid.test.ts`); if present, add the two `it(...)` cases into the existing describe and reuse its helpers.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { updateAuctionHandler } from './updateAuction.js';

function asStaff(data: Record<string, unknown>): CallableRequest {
  return {
    auth: { uid: 'staff-1', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const sub = await d.collection('priceChanges').listDocuments();
        await Promise.all(sub.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seedScheduledAuction(id = 'a1', startingPrice = 10000) {
  await adminDb()
    .doc(`auctions/${id}`)
    .set({
      id,
      vehicleId: 'v1',
      status: 'scheduled',
      startingPrice,
      bidIncrement: 100,
      startsAt: Timestamp.fromMillis(Date.now() + 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + 7200_000),
      createdAt: FieldValue.serverTimestamp(),
    });
}

describe('updateAuction priceChanges', () => {
  beforeEach(clearAll);

  it('records a reduction with isReduction=true and actor name', async () => {
    await adminDb()
      .doc('users/staff-1')
      .set({
        uid: 'staff-1',
        role: 'staff',
        status: 'active',
        email: 'staff@santarosa.com.py',
        profile: { firstName: 'Sofia', lastName: 'Rios' },
      });
    await seedScheduledAuction('a1', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'a1', startingPrice: 9000 }));

    const changes = await adminDb().collection('auctions/a1/priceChanges').get();
    expect(changes.size).toBe(1);
    const c = changes.docs[0]!.data();
    expect(c['field']).toBe('startingPrice');
    expect(c['from']).toBe(10000);
    expect(c['to']).toBe(9000);
    expect(c['isReduction']).toBe(true);
    expect(c['actorUid']).toBe('staff-1');
    expect(c['actorName']).toContain('Sofia');
  });

  it('records an increase with isReduction=false and none when price untouched', async () => {
    await seedScheduledAuction('a2', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'a2', startingPrice: 12000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'a2', bidIncrement: 250 }));

    const changes = await adminDb().collection('auctions/a2/priceChanges').get();
    expect(changes.size).toBe(1);
    expect(changes.docs[0]!.data()['isReduction']).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `pnpm --filter @carbid/functions test updateAuction`
Expected: FAIL — no `priceChanges` docs written yet.

- [ ] **Step 3: Add the hook**

In `functions/src/auctions/updateAuction.ts`, right after `await ref.update(update);` and before `await writeAuditLog({...})`, insert:

```ts
// ---- Price-change history (insights report) ----
// Every startingPrice/reservePrice edit is recorded in a dedicated
// subcollection so staff can see "how many times was this lowered" without
// digging through audit_logs. Actor name is snapshotted for display.
const priceFields: Array<'startingPrice' | 'reservePrice'> = [];
if (v.startingPrice !== undefined && v.startingPrice !== a['startingPrice']) {
  priceFields.push('startingPrice');
}
if (v.reservePrice !== undefined && v.reservePrice !== (a['reservePrice'] ?? null)) {
  priceFields.push('reservePrice');
}
if (priceFields.length > 0) {
  const actorSnap = await adminDb().doc(`users/${actorUid}`).get();
  const ap = (actorSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
  const actorName =
    [ap['firstName'], ap['lastName']].filter(Boolean).join(' ') ||
    ((actorSnap.data()?.['email'] as string) ?? actorUid);
  const batch = adminDb().batch();
  for (const field of priceFields) {
    const from = (a[field] as number | undefined) ?? null;
    const to = field === 'reservePrice' && v.reservePrice === null ? null : (v[field] as number);
    batch.set(ref.collection('priceChanges').doc(), {
      field,
      from,
      to,
      isReduction: typeof from === 'number' && typeof to === 'number' && to < from,
      actorUid,
      actorName,
      at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}
```

(`adminDb` and `FieldValue` are already imported in this file.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @carbid/functions test updateAuction`
Expected: new cases PASS, pre-existing cases still PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/auctions/updateAuction.ts functions/src/auctions/updateAuction.test.ts
git commit -m "feat(insights): record price changes on auction edits"
```

---

## Task 4: `firstListedAt` stamp in `createAuction`

**Files:**

- Modify: `functions/src/auctions/createAuction.ts` (the `tx.update(vehicleRef, ...)` block, ~line 93)
- Test: `functions/src/auctions/createAuction.test.ts` (add one case; reuse existing helpers in that file)

- [ ] **Step 1: Add the failing test**

In `functions/src/auctions/createAuction.test.ts`, inside the existing describe (adapt the seed helper names to the file's existing ones — read it first):

```ts
it('stamps vehicle.firstListedAt on the FIRST auction only', async () => {
  // Uses the file's existing vehicle seed + valid input helpers.
  const vehicleId = await seedReadyVehicle();
  await createAuctionHandler(asStaff(validInput(vehicleId)));
  const v1 = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data()!;
  expect(v1['firstListedAt']).toBeTruthy();
  const stamped = v1['firstListedAt'];

  // Re-list: put it back to ready, create a second auction — stamp must NOT move.
  await adminDb().doc(`vehicles/${vehicleId}`).update({ status: 'ready' });
  await createAuctionHandler(asStaff(validInput(vehicleId)));
  const v2 = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data()!;
  expect(v2['firstListedAt']).toEqual(stamped);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @carbid/functions test createAuction`
Expected: FAIL — `firstListedAt` undefined.

- [ ] **Step 3: Stamp it**

In `functions/src/auctions/createAuction.ts`, the transaction already reads the vehicle (`const vSnap = await tx.get(vehicleRef);` → `vData`). Change the `tx.update(vehicleRef, ...)` call to:

```ts
tx.update(vehicleRef, {
  status: 'in_auction',
  updatedAt: FieldValue.serverTimestamp(),
  // First time this vehicle goes to market — anchor for the 7-day
  // unsold alert. Re-listings keep the original date.
  ...(vData['firstListedAt'] ? {} : { firstListedAt: FieldValue.serverTimestamp() }),
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @carbid/functions test createAuction`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add functions/src/auctions/createAuction.ts functions/src/auctions/createAuction.test.ts
git commit -m "feat(insights): stamp vehicles.firstListedAt on first listing"
```

---

## Task 5: `dailyUnsoldDigest` scheduler

**Files:**

- Create: `functions/src/insights/dailyUnsoldDigest.ts`
- Test: `functions/src/insights/dailyUnsoldDigest.test.ts`
- Modify: `functions/src/index.ts` (export)

- [ ] **Step 1: Write the failing test**

Create `functions/src/insights/dailyUnsoldDigest.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { runDailyUnsoldDigest } from './dailyUnsoldDigest.js';

const DAY = 24 * 3600_000;

async function clearAll() {
  for (const c of ['vehicles', 'users', 'auctions']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedVehicle(
  id: string,
  opts: { listedDaysAgo?: number; status?: string; alerted?: boolean } = {},
) {
  await adminDb()
    .doc(`vehicles/${id}`)
    .set({
      id,
      make: 'Toyota',
      model: 'Hilux',
      year: 2021,
      status: opts.status ?? 'in_auction',
      createdAt: FieldValue.serverTimestamp(),
      ...(opts.listedDaysAgo !== undefined
        ? { firstListedAt: Timestamp.fromMillis(Date.now() - opts.listedDaysAgo * DAY) }
        : {}),
      ...(opts.alerted ? { unsoldAlertAt: FieldValue.serverTimestamp() } : {}),
    });
}

async function seedStaff(uid: string, email: string) {
  await adminDb().doc(`users/${uid}`).set({ uid, role: 'staff', status: 'active', email });
}

describe('dailyUnsoldDigest', () => {
  beforeEach(clearAll);

  it('emails staff about 7+ day unsold vehicles and marks them', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 8 });
    await seedVehicle('v-fresh', { listedDaysAgo: 2 });
    await seedVehicle('v-sold', { listedDaysAgo: 10, status: 'sold' });
    await seedVehicle('v-done', { listedDaysAgo: 10, alerted: true });

    const send = vi.fn().mockResolvedValue({ ok: true });
    const r = await runDailyUnsoldDigest(Date.now(), { send });

    expect(r.alerted).toEqual(['v-old']);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe('staff@santarosa.com.py');
    expect(arg.html).toContain('Hilux');

    const v = (await adminDb().doc('vehicles/v-old').get()).data()!;
    expect(v['unsoldAlertAt']).toBeTruthy();
  });

  it('is idempotent — second run alerts nothing', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 9 });
    const send = vi.fn().mockResolvedValue({ ok: true });
    await runDailyUnsoldDigest(Date.now(), { send });
    const r2 = await runDailyUnsoldDigest(Date.now(), { send });
    expect(r2.alerted).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not mark vehicles when the email fails (retries next run)', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 8 });
    const send = vi.fn().mockRejectedValue(new Error('resend down'));
    const r = await runDailyUnsoldDigest(Date.now(), { send });
    expect(r.alerted).toEqual([]);
    const v = (await adminDb().doc('vehicles/v-old').get()).data()!;
    expect(v['unsoldAlertAt']).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @carbid/functions test dailyUnsoldDigest`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the scheduler**

Create `functions/src/insights/dailyUnsoldDigest.ts`:

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY, type SendEmailArgs } from '../lib/email.js';
import { emailShell, body, badge, heading } from '../lib/email-templates.js';

const UNSOLD_THRESHOLD_DAYS = 7;
const DAY_MS = 24 * 3600_000;

export interface UnsoldDigestResult {
  scanned: number;
  alerted: string[];
}

interface Deps {
  send: (args: SendEmailArgs) => Promise<unknown>;
}

/**
 * Daily 7-days-unsold alert.
 *
 * Finds vehicles first listed >= 7 days ago that never sold and were never
 * alerted, sends ONE digest email to every active admin/staff, then marks
 * each vehicle's `unsoldAlertAt` (idempotency). Marks are written only after
 * the email succeeds — a Resend outage means an automatic retry tomorrow.
 * The red badge in /staff/insights is computed live and does NOT depend on
 * this mark.
 */
export async function runDailyUnsoldDigest(
  now: number = Date.now(),
  deps: Deps = { send: sendEmail },
): Promise<UnsoldDigestResult> {
  const db = adminDb();
  const cutoff = Timestamp.fromMillis(now - UNSOLD_THRESHOLD_DAYS * DAY_MS);

  // Single range filter; status/alert filtering happens in memory — vehicle
  // counts are small (hundreds at most) and this avoids composite-index and
  // not-in constraints.
  const snap = await db
    .collection('vehicles')
    .where('firstListedAt', '<=', cutoff)
    .limit(500)
    .get();

  const pending = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
    .filter((v) => v['status'] !== 'sold' && v['status'] !== 'archived' && !v['unsoldAlertAt']);

  if (pending.length === 0) return { scanned: snap.size, alerted: [] };

  // Recipients: every active admin/staff.
  const staffSnap = await db
    .collection('users')
    .where('role', 'in', ['admin', 'staff'])
    .where('status', '==', 'active')
    .get();
  const recipients = staffSnap.docs
    .map((d) => d.data()['email'] as string | undefined)
    .filter((e): e is string => !!e);

  const rows = pending
    .map((v) => {
      const listedAt = (v['firstListedAt'] as Timestamp).toMillis();
      const days = Math.floor((now - listedAt) / DAY_MS);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#0a0a0a;font-size:14px;">
          ${v['make']} ${v['model']} <span style="color:#71717a;">${v['year']}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#dc2626;font-weight:600;font-size:14px;">
          ${days} días
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:13px;">
          <a href="https://renewsubastas.com.py/es/staff/insights/${v.id}" style="color:#0a0a0a;">Ver reporte</a>
        </td>
      </tr>`;
    })
    .join('');

  const html = emailShell(
    body(
      badge('Alerta de inventario', 'warning') +
        heading(
          `${pending.length} vehículo${pending.length === 1 ? '' : 's'} sin vender hace 7+ días`,
          'Estos vehículos llevan una semana o más publicados sin venderse. Revisá precio y demanda en el reporte.',
        ) +
        `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>`,
    ),
  );

  // One email per recipient; a single failure aborts the marking so tomorrow
  // retries the whole batch (idempotent from the buyer's perspective — the
  // vehicles were never marked).
  for (const to of recipients) {
    await deps.send({
      to,
      subject: `Renew: ${pending.length} vehículo(s) sin vender hace 7+ días`,
      html,
    });
  }

  const batch = db.batch();
  for (const v of pending) {
    batch.update(db.doc(`vehicles/${v.id}`), { unsoldAlertAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  return { scanned: snap.size, alerted: pending.map((v) => v.id) };
}

export const dailyUnsoldDigest = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'America/Asuncion',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const r = await runDailyUnsoldDigest();
    console.log(`dailyUnsoldDigest: scanned=${r.scanned} alerted=${r.alerted.length}`);
  },
);
```

> If `SendEmailArgs` is not exported from `../lib/email.js`, check the actual exported names (`grep "export" functions/src/lib/email.ts`) and import accordingly — the interface exists (`SendEmailArgs` at line ~27). If `badge(...)`'s second parameter doesn't accept `'warning'`, check `email-templates.ts` for the valid variants and use the closest (`'neutral'`).

- [ ] **Step 4: Export in `functions/src/index.ts`**

```ts
export { dailyUnsoldDigest } from './insights/dailyUnsoldDigest.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @carbid/functions test dailyUnsoldDigest`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/insights/dailyUnsoldDigest.ts functions/src/insights/dailyUnsoldDigest.test.ts functions/src/index.ts
git commit -m "feat(insights): daily 7-days-unsold digest email to admin/staff"
```

---

## Task 6: Firestore rules for `viewers` + `priceChanges`

**Files:**

- Modify: `firestore.rules` (inside `match /auctions/{id} { ... }`, after the `bids` block)

- [ ] **Step 1: Add the subcollection rules**

Inside the existing `match /auctions/{id} { ... }` block, after the `match /bids/{bidId} { ... }` block, add:

```
      // Insights subcollections: who viewed the auction and how prices moved.
      // Internal eyes only — buyers must never see who else is watching a car
      // or the pricing history. Writes are Admin SDK only (Cloud Functions).
      match /viewers/{viewerUid} {
        allow read: if isAdmin() || isStaff();
        allow create, update, delete: if false;
      }
      match /priceChanges/{changeId} {
        allow read: if isAdmin() || isStaff();
        allow create, update, delete: if false;
      }
```

- [ ] **Step 2: Sanity-check rules compile**

Run: `npx firebase-tools@15 deploy --only firestore:rules --project carbid-staging --dry-run 2>&1 | tail -3`
(If `--dry-run` is unsupported in this CLI version, skip — rules syntax is validated at deploy time in Task 10; the emulator also loads them: restart `pnpm emulators` and confirm no rules parse error in its output.)

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(insights): admin/staff read rules for viewers + priceChanges"
```

---

## Task 7: Web server loaders

**Files:**

- Create: `apps/web/src/lib/insights/load-insights.ts`
- Create: `apps/web/src/lib/insights/load-vehicle-insight.ts`

No unit tests (web package has none for loaders — pattern matches `load-buyer-stats.ts`); verified via typecheck + the pages in Task 9.

- [ ] **Step 1: List loader**

Create `apps/web/src/lib/insights/load-insights.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface VehicleInsightRow {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  status: string;
  /** Days since first listing; null when never listed. */
  daysListed: number | null;
  /** ≥7 days listed and not sold/archived. */
  unsoldAlert: boolean;
  viewsTotal: number;
  viewsUnique: number;
  priceReductions: number;
  /** Latest auction's current/final price (USD), null when no auction yet. */
  currentPrice: number | null;
}

const DAY_MS = 24 * 3600_000;

/**
 * One row per vehicle for /staff/insights. Reads vehicles + all their
 * auctions in two queries and aggregates in memory — inventory is small
 * (hundreds), so this stays cheap and index-free.
 */
export async function loadInsights(): Promise<VehicleInsightRow[]> {
  const db = getFirestore(getAdminApp());
  const now = Date.now();

  const [vehiclesSnap, auctionsSnap] = await Promise.all([
    db.collection('vehicles').orderBy('createdAt', 'desc').limit(300).get(),
    db.collection('auctions').orderBy('createdAt', 'desc').limit(1000).get(),
  ]);

  // Group auctions by vehicle.
  const byVehicle = new Map<string, FirebaseFirestore.DocumentData[]>();
  for (const doc of auctionsSnap.docs) {
    const a = doc.data();
    const vid = a['vehicleId'] as string;
    const list = byVehicle.get(vid) ?? [];
    list.push(a);
    byVehicle.set(vid, list);
  }

  // Price reductions per vehicle: one collectionGroup query over priceChanges.
  const reductionsByVehicle = new Map<string, number>();
  const pcSnap = await db.collectionGroup('priceChanges').where('isReduction', '==', true).get();
  for (const doc of pcSnap.docs) {
    const auctionRef = doc.ref.parent.parent;
    if (!auctionRef) continue;
    const auction = auctionsSnap.docs.find((a) => a.id === auctionRef.id)?.data();
    const vid = auction?.['vehicleId'] as string | undefined;
    if (!vid) continue;
    reductionsByVehicle.set(vid, (reductionsByVehicle.get(vid) ?? 0) + 1);
  }

  const rows: VehicleInsightRow[] = vehiclesSnap.docs.map((doc) => {
    const v = doc.data();
    const auctions = byVehicle.get(doc.id) ?? [];
    const listedAt = v['firstListedAt'] as Timestamp | undefined;
    const daysListed = listedAt ? Math.floor((now - listedAt.toMillis()) / DAY_MS) : null;
    const sold = v['status'] === 'sold' || v['status'] === 'archived';

    let viewsTotal = 0;
    let viewsUnique = 0;
    for (const a of auctions) {
      const vs = (a['viewStats'] ?? {}) as { total?: number; unique?: number };
      viewsTotal += vs.total ?? 0;
      viewsUnique += vs.unique ?? 0;
    }
    const latest = auctions[0];
    const currentPrice = latest
      ? ((latest['finalPrice'] as number | undefined) ??
        ((latest['currentBid'] as number) > 0
          ? (latest['currentBid'] as number)
          : (latest['startingPrice'] as number)))
      : null;

    return {
      vehicleId: doc.id,
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      status: (v['status'] as string) ?? '',
      daysListed,
      unsoldAlert: daysListed !== null && daysListed >= 7 && !sold,
      viewsTotal,
      viewsUnique,
      priceReductions: reductionsByVehicle.get(doc.id) ?? 0,
      currentPrice,
    };
  });

  // Alerted first, then most days listed.
  rows.sort(
    (x, y) =>
      Number(y.unsoldAlert) - Number(x.unsoldAlert) || (y.daysListed ?? -1) - (x.daysListed ?? -1),
  );
  return rows;
}
```

> `thumbnailUrl` may live elsewhere on the vehicle doc (e.g. `photos[0]` or inside a media field). After creating the file, check the real shape: `grep -nE "thumbnail|photos|images" packages/shared-types/src/vehicle.ts` and adjust that one line to match (fall back to `null` when absent).

- [ ] **Step 2: Detail loader**

Create `apps/web/src/lib/insights/load-vehicle-insight.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface ViewerEntry {
  uid: string;
  name: string; // "Ana G."
  viewCount: number;
  lastViewAtMs: number;
}

export interface PriceChangeEntry {
  field: string;
  from: number | null;
  to: number | null;
  isReduction: boolean;
  actorName: string;
  atMs: number;
}

export interface AuctionSummary {
  id: string;
  status: string;
  outcome: string | null;
  finalPrice: number | null;
  startingPrice: number;
  endsAtMs: number;
  viewsTotal: number;
  viewsUnique: number;
}

export interface VehicleInsight {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  status: string;
  daysListed: number | null;
  unsoldAlert: boolean;
  auctions: AuctionSummary[];
  viewers: ViewerEntry[];
  priceChanges: PriceChangeEntry[];
}

const DAY_MS = 24 * 3600_000;

export async function loadVehicleInsight(vehicleId: string): Promise<VehicleInsight | null> {
  const db = getFirestore(getAdminApp());
  const now = Date.now();

  const vSnap = await db.doc(`vehicles/${vehicleId}`).get();
  if (!vSnap.exists) return null;
  const v = vSnap.data()!;

  const auctionsSnap = await db
    .collection('auctions')
    .where('vehicleId', '==', vehicleId)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const auctions: AuctionSummary[] = auctionsSnap.docs.map((d) => {
    const a = d.data();
    const vs = (a['viewStats'] ?? {}) as { total?: number; unique?: number };
    return {
      id: d.id,
      status: (a['status'] as string) ?? '',
      outcome: (a['outcome'] as string | undefined) ?? null,
      finalPrice: (a['finalPrice'] as number | undefined) ?? null,
      startingPrice: (a['startingPrice'] as number) ?? 0,
      endsAtMs: (a['endsAt'] as Timestamp).toMillis(),
      viewsTotal: vs.total ?? 0,
      viewsUnique: vs.unique ?? 0,
    };
  });

  // Viewers + price changes across all of the vehicle's auctions.
  const viewers: ViewerEntry[] = [];
  const priceChanges: PriceChangeEntry[] = [];
  await Promise.all(
    auctionsSnap.docs.map(async (aDoc) => {
      const [vwSnap, pcSnap] = await Promise.all([
        aDoc.ref.collection('viewers').orderBy('lastViewAt', 'desc').limit(200).get(),
        aDoc.ref.collection('priceChanges').orderBy('at', 'desc').limit(100).get(),
      ]);
      for (const d of vwSnap.docs) {
        const w = d.data();
        viewers.push({
          uid: (w['uid'] as string) ?? d.id,
          name: `${w['firstName'] ?? ''} ${w['lastInitial'] ?? ''}.`.trim(),
          viewCount: (w['viewCount'] as number) ?? 0,
          lastViewAtMs: (w['lastViewAt'] as Timestamp).toMillis(),
        });
      }
      for (const d of pcSnap.docs) {
        const c = d.data();
        priceChanges.push({
          field: (c['field'] as string) ?? '',
          from: (c['from'] as number | null) ?? null,
          to: (c['to'] as number | null) ?? null,
          isReduction: Boolean(c['isReduction']),
          actorName: (c['actorName'] as string) ?? '',
          atMs: (c['at'] as Timestamp).toMillis(),
        });
      }
    }),
  );
  viewers.sort((a, b) => b.lastViewAtMs - a.lastViewAtMs);
  priceChanges.sort((a, b) => b.atMs - a.atMs);

  const listedAt = v['firstListedAt'] as Timestamp | undefined;
  const daysListed = listedAt ? Math.floor((now - listedAt.toMillis()) / DAY_MS) : null;
  const sold = v['status'] === 'sold' || v['status'] === 'archived';

  return {
    vehicleId,
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    status: (v['status'] as string) ?? '',
    daysListed,
    unsoldAlert: daysListed !== null && daysListed >= 7 && !sold,
    auctions,
    viewers,
    priceChanges,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @carbid/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/insights/
git commit -m "feat(insights): server loaders for the vehicle insights report"
```

---

## Task 8: `ViewTracker` client component

**Files:**

- Create: `apps/web/src/components/insights/view-tracker.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/auctions/[id]/page.tsx` (render it)

- [ ] **Step 1: Create the tracker**

Create `apps/web/src/components/insights/view-tracker.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';

const THROTTLE_MS = 30 * 60_000; // one logged view per auction per 30 min per tab session

/**
 * Invisible view logger for the auction detail page. Fire-and-forget: any
 * failure is swallowed — tracking must never affect the buyer experience.
 * sessionStorage throttling keeps reloads/navigation from inflating counts;
 * the callable additionally rate-limits server-side.
 */
export function ViewTracker({ auctionId }: { auctionId: string }) {
  useEffect(() => {
    const key = `renew:view:${auctionId}`;
    try {
      const last = Number(window.sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < THROTTLE_MS) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // private browsing — still log, just without throttle persistence
    }
    httpsCallable(
      fb.functions,
      'logAuctionView',
    )({ auctionId }).catch((err) => {
      console.warn('[view-tracker] failed', err);
    });
  }, [auctionId]);

  return null;
}
```

- [ ] **Step 2: Mount it in the auction detail page**

Read `apps/web/src/app/[locale]/(protected)/auctions/[id]/page.tsx`. Add the import:

```ts
import { ViewTracker } from '@/components/insights/view-tracker';
```

Inside the page component's returned JSX, add as the first child of the root element (the auction id variable in that file is the route param, e.g. `params.id`):

```tsx
<ViewTracker auctionId={params.id} />
```

(Adjust to the file's actual param name — read it first. If the page destructures `params: { id }`, use `auctionId={id}`.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/insights/view-tracker.tsx "apps/web/src/app/[locale]/(protected)/auctions/[id]/page.tsx"
git commit -m "feat(insights): invisible view tracker on auction detail"
```

---

## Task 9: Report pages + nav entry

**Files:**

- Create: `apps/web/src/app/[locale]/(protected)/staff/insights/page.tsx`
- Create: `apps/web/src/app/[locale]/(protected)/staff/insights/[vehicleId]/page.tsx`
- Modify: `apps/web/src/components/shell/nav-config.ts` (IconKey + admin/staff items)
- Modify: `apps/web/src/components/shell/sidebar-nav.tsx` (ICON_MAP entry)

- [ ] **Step 1: Nav icon + entries**

In `apps/web/src/components/shell/nav-config.ts`: add `'chart'` to the `IconKey` union type. Then add to BOTH the admin items array (after the `staff/bids` "Pujas" line) and the staff items array (same position):

```ts
      { href: `/${locale}/staff/insights`, label: 'Reporte', icon: 'chart' },
```

In `apps/web/src/components/shell/sidebar-nav.tsx`: add `BarChart3` to the lucide-react import list and add to `ICON_MAP`:

```ts
  chart: BarChart3,
```

- [ ] **Step 2: List page**

Create `apps/web/src/app/[locale]/(protected)/staff/insights/page.tsx`:

```tsx
import Link from 'next/link';
import { AlertTriangle, Eye, TrendingDown } from 'lucide-react';
import { requireRole } from '@/lib/auth/server';
import { loadInsights } from '@/lib/insights/load-insights';

export const dynamic = 'force-dynamic';

export default async function InsightsPage({ params: { locale } }: { params: { locale: string } }) {
  await requireRole(locale, ['admin', 'staff']);
  const rows = await loadInsights();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Reporte
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          Insights de remates
        </h1>
        <p className="text-sm text-text-muted">
          Quién mira cada vehículo, cómo se movió el precio y cuáles llevan 7+ días sin venderse.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-10 text-center">
          <p className="text-sm text-text-muted">Todavía no hay vehículos publicados.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((r) => (
            <li key={r.vehicleId}>
              <Link
                href={`/${locale}/staff/insights/${r.vehicleId}` as `/${string}`}
                className="flex items-center gap-3 rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-3 transition-colors hover:border-text-subtle/30 hover:bg-bg-elev/60"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-strong truncate">
                    {r.make} {r.model} <span className="text-text-muted num-tab">{r.year}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" aria-hidden /> {r.viewsUnique} únicos ·{' '}
                      {r.viewsTotal} vistas
                    </span>
                    {r.priceReductions > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-400">
                        <TrendingDown className="w-3 h-3" aria-hidden /> {r.priceReductions} baja
                        {r.priceReductions === 1 ? '' : 's'}
                      </span>
                    )}
                    {r.currentPrice !== null && (
                      <span className="num-tab">USD {r.currentPrice.toLocaleString()}</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.daysListed !== null && (
                    <p
                      className={
                        'text-xs num-tab font-medium ' +
                        (r.unsoldAlert ? 'text-rose-400' : 'text-text-muted')
                      }
                    >
                      {r.unsoldAlert && (
                        <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
                      )}
                      {r.daysListed} día{r.daysListed === 1 ? '' : 's'}
                    </p>
                  )}
                  <p className="text-[11px] text-text-muted mt-0.5">{r.status}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Detail page**

Create `apps/web/src/app/[locale]/(protected)/staff/insights/[vehicleId]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Eye } from 'lucide-react';
import { requireRole } from '@/lib/auth/server';
import { loadVehicleInsight } from '@/lib/insights/load-vehicle-insight';

export const dynamic = 'force-dynamic';

interface Props {
  params: { locale: string; vehicleId: string };
}

export default async function VehicleInsightPage({ params: { locale, vehicleId } }: Props) {
  await requireRole(locale, ['admin', 'staff']);
  const v = await loadVehicleInsight(vehicleId);
  if (!v) notFound();

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(ms);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/${locale}/staff/insights` as `/${string}`}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Reporte
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          {v.make} {v.model} <span className="text-text-muted num-tab">{v.year}</span>
        </h1>
        <p className="flex items-center gap-3 text-sm text-text-muted">
          <span>{v.status}</span>
          {v.daysListed !== null && (
            <span className={v.unsoldAlert ? 'text-rose-400 font-medium' : ''}>
              {v.unsoldAlert && (
                <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden />
              )}
              {v.daysListed} día{v.daysListed === 1 ? '' : 's'} publicado
            </span>
          )}
        </p>
      </header>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">
          Movimientos de precio
        </h2>
        {v.priceChanges.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Sin cambios de precio registrados.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.priceChanges.map((c, i) => (
              <li key={i} className="py-2.5 flex items-center gap-3 text-sm">
                {c.isReduction ? (
                  <ArrowDown className="w-4 h-4 text-rose-400 shrink-0" aria-hidden />
                ) : (
                  <ArrowUp className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                )}
                <span className="num-tab text-text-strong">
                  {c.from !== null ? `USD ${c.from.toLocaleString()}` : '—'} →{' '}
                  {c.to !== null ? `USD ${c.to.toLocaleString()}` : '—'}
                </span>
                <span className="text-xs text-text-muted truncate flex-1">
                  {c.field === 'reservePrice' ? 'reserva' : 'precio base'} · {c.actorName}
                </span>
                <span className="text-xs text-text-muted num-tab shrink-0">{fmtDate(c.atMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">
          Quiénes lo miraron
        </h2>
        {v.viewers.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Sin vistas registradas todavía.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.viewers.map((w) => (
              <li key={w.uid} className="py-2.5 flex items-center gap-3 text-sm">
                <Eye className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                <span className="text-text-strong flex-1 truncate">{w.name}</span>
                <span className="text-xs text-text-muted num-tab">
                  {w.viewCount} vista{w.viewCount === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-text-muted num-tab shrink-0">
                  {fmtDate(w.lastViewAtMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">Subastas</h2>
        {v.auctions.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Nunca fue subastado.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.auctions.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center gap-3 text-sm">
                <Link
                  href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                  className="text-text-strong hover:text-copper transition-colors flex-1 truncate"
                >
                  {a.status}
                  {a.outcome ? ` · ${a.outcome}` : ''}
                </Link>
                <span className="text-xs text-text-muted num-tab">
                  {a.viewsUnique} únicos / {a.viewsTotal}
                </span>
                <span className="num-tab text-text-strong shrink-0">
                  USD {(a.finalPrice ?? a.startingPrice).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build`
Expected: PASS — new routes `/[locale]/staff/insights` + `/[locale]/staff/insights/[vehicleId]` appear in the route list.

- [ ] **Step 5: Full test suites (regression)**

Run: `pnpm --filter @carbid/shared-types test && pnpm --filter @carbid/functions test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[locale]/(protected)/staff/insights" apps/web/src/components/shell/nav-config.ts apps/web/src/components/shell/sidebar-nav.tsx
git commit -m "feat(insights): staff report pages + nav entry"
```

---

## Task 10: Deploy (manual, operator checklist)

> Prod is NOT git-connected; deploys are manual (see project memory). Order matters: rules+functions BEFORE web so the callable exists when the tracker first fires.

- [ ] **Step 1: Merge branch to main** (PR → review → squash-merge), then `git checkout main && git pull`.

- [ ] **Step 2: Deploy rules + functions to carbid-staging (the prod Firebase project):**

```bash
pnpm --filter @carbid/shared-types build && pnpm --filter @carbid/functions build
npx firebase-tools@15 deploy --only firestore:rules,functions --project carbid-staging
```

Expected: `logAuctionView` + `dailyUnsoldDigest` created; `updateAuction`/`createAuction` updated; rules compile.

- [ ] **Step 3: Deploy web:**

```bash
netlify deploy --build --prod --filter @carbid/web --site 5ecfa35d-a428-452f-9c48-115a0b257114
```

- [ ] **Step 4: Smoke test:**
  - As a buyer, open an auction detail → in Firestore check `auctions/{id}/viewers/{uid}` appears and `viewStats` incremented.
  - As staff, edit an auction's price down → `priceChanges` doc with `isReduction: true`.
  - Open `/es/staff/insights` as staff → row shows views + reduction; as buyer → 404.
  - Digest: wait for the 09:00 run or trigger once manually from the console (Cloud Scheduler → dailyUnsoldDigest → Force run) and verify the email.

---

## Notes

- **Data starts at zero** — views/price history only accrue after deploy. Tell the owner.
- The collectionGroup query in `load-insights.ts` (`priceChanges` where `isReduction == true`) needs a **collection-group index** on first use; Firestore will emit a console link in the error if so — click-create it, or pre-add to `firestore.indexes.json` (collectionGroup `priceChanges`, field `isReduction` ASC, query scope COLLECTION_GROUP).
- `rate_limits/views_{uid}` reuses the existing rate-limits collection (already locked to Admin SDK by rules).
