# CARBID Plan 6 — Real-time Bidding (placeBid + UI)

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Buyers can place bids on `live` auctions. The Cloud Function `placeBid` runs as a Firestore transaction with strict validation, anti-sniping (extends `endsAt` by N seconds when the bid lands in the last N seconds), self-outbid prevention, and rate limiting (10 bids/min/buyer). The buyer detail page replaces the Plan 5 placeholder with a real bid form (quick increments + optional manual amount).

**Architecture:**

- Server-only writes to `auctions` and bids subcollection (Firestore rules already block client writes).
- `placeBid` Cloud Function (callable, buyer/admin) does:
  1. `requireSignedIn` + role check
  2. Rate limit check (read `rate_limits/bids_{uid}` doc with last 10 timestamps)
  3. Transaction:
     - Read auction. Must be `live` and `endsAt > now`.
     - Validate amount `>= currentBid + bidIncrement` (fall back to `startingPrice` for first bid).
     - Reject self-outbid (`currentBidderUid === actorUid`).
     - Anti-sniping: if `endsAt - now < antiSnipingSeconds * 1000`, extend `endsAt` by `antiSnipingSeconds` seconds.
     - Mark previous winning bid as `outbid`, write new bid as `winning`.
     - Update auction `currentBid`, `currentBidderUid`, `bidCount` (increment).
  4. Write rate-limit timestamp.
- Anti-sniping window comes from `app_config.bid.antiSnipingSeconds` (default 60).
- UI: replace the placeholder card in the buyer detail with a real form. Quick increments derived from auction's `bidIncrement` (e.g. +1, +2, +5 increments). Optional manual input behind `app_config.bid.allowManualIncrement`.

**Spec reference:** §5 (`auctions.placeBid` row), §6 buyer detail "Panel de puja sticky" + anti-sniping rule.

**Prerequisites:** Plans 1-5 complete.

---

## File Structure

```
functions/src/auctions/
├── placeBid.ts
└── placeBid.test.ts          ~10 tests
functions/src/index.ts         + export

apps/web/src/app/[locale]/(protected)/auctions/[id]/
├── auction-detail-view.tsx   modify: replace placeholder card with <BidPanel/>
└── bid-panel.tsx             new client component
```

---

## Task 1: placeBid Cloud Function (TDD)

- [ ] **Step 1.1: Implement** `functions/src/auctions/placeBid.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const InputSchema = z.object({
  auctionId: z.string().min(1),
  amount: z.number().positive(),
});

const RATE_LIMIT_MAX = 10; // bids per minute per buyer
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_ANTI_SNIPING_SECONDS = 60;

export interface PlaceBidResult {
  bidId: string;
  newCurrentBid: number;
  endsAtMs: number; // possibly extended by anti-sniping
}

export async function placeBidHandler(req: CallableRequest): Promise<PlaceBidResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only buyers can place bids');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId, amount } = parsed.data;

  const db = adminDb();

  // ---- Rate limit (outside transaction) ----
  const rlRef = db.doc(`rate_limits/bids_${uid}`);
  const rlSnap = await rlRef.get();
  const now = Date.now();
  const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    throw new HttpsError('resource-exhausted', 'Bid rate limit exceeded (10/min)');
  }

  // ---- Anti-sniping config (outside transaction; cached doc) ----
  const cfgSnap = await db.doc('app_config/global').get();
  const antiSnipingSeconds =
    (cfgSnap.data()?.['bid']?.antiSnipingSeconds as number | undefined) ??
    DEFAULT_ANTI_SNIPING_SECONDS;

  const auctionRef = db.doc(`auctions/${auctionId}`);

  // ---- Buyer profile snapshot (for buyerSnapshot field) ----
  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
  const buyerSnapshot = {
    firstName: (profile['firstName'] as string) ?? '',
    lastInitial: ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?',
  };

  const result = await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    if (a['status'] !== 'live') {
      throw new HttpsError('failed-precondition', `Auction is ${a['status']}, not live`);
    }
    const endsAt = a['endsAt'] as Timestamp;
    if (endsAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Auction has ended');
    }
    if (a['currentBidderUid'] === uid) {
      throw new HttpsError('failed-precondition', 'Cannot outbid yourself');
    }

    const currentBid = (a['currentBid'] as number) ?? 0;
    const startingPrice = (a['startingPrice'] as number) ?? 0;
    const bidIncrement = (a['bidIncrement'] as number) ?? 0;
    const minRequired = currentBid > 0 ? currentBid + bidIncrement : startingPrice;
    if (amount < minRequired) {
      throw new HttpsError('failed-precondition', `Bid must be at least ${minRequired}`);
    }

    // Anti-sniping: extend endsAt if within window
    const remainingMs = endsAt.toMillis() - now;
    let nextEndsAt = endsAt;
    if (remainingMs < antiSnipingSeconds * 1000) {
      nextEndsAt = Timestamp.fromMillis(now + antiSnipingSeconds * 1000);
    }

    // Mark previous winning bid as outbid
    if (a['currentBidderUid']) {
      const prevQ = await tx.get(
        auctionRef.collection('bids').where('status', '==', 'winning').limit(1),
      );
      prevQ.forEach((doc) => tx.update(doc.ref, { status: 'outbid' }));
    }

    const bidRef = auctionRef.collection('bids').doc();
    tx.set(bidRef, {
      id: bidRef.id,
      auctionId,
      buyerUid: uid,
      buyerSnapshot,
      amount,
      createdAt: FieldValue.serverTimestamp(),
      status: 'winning',
    });

    tx.update(auctionRef, {
      currentBid: amount,
      currentBidderUid: uid,
      bidCount: FieldValue.increment(1),
      endsAt: nextEndsAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { bidId: bidRef.id, newCurrentBid: amount, endsAtMs: nextEndsAt.toMillis() };
  });

  // ---- Update rate limit doc (outside transaction) ----
  await rlRef.set({ timestamps: [...recent, now] }, { merge: true });

  return result;
}

export const placeBid = onCall({ region: 'us-central1' }, placeBidHandler);
```

- [ ] **Step 1.2: Test** — 9 cases:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { placeBidHandler } from './placeBid.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

function asBuyer(uid: string, data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asStaff(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'rate_limits', 'users']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedBuyer(uid: string, firstName = 'Juan', lastName = 'Perez') {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email: `${uid}@example.com`,
      status: 'active',
      profile: { firstName, lastName, documentType: 'CI', documentNumber: '1234567' },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'bootstrap',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

interface SeedAuctionOpts {
  status?: 'scheduled' | 'live' | 'ended';
  endsInMs?: number;
  startingPrice?: number;
  bidIncrement?: number;
  currentBid?: number;
  currentBidderUid?: string;
}

async function seedAuction(opts: SeedAuctionOpts = {}): Promise<string> {
  const ref = adminDb().collection('auctions').doc();
  const status = opts.status ?? 'live';
  const endsInMs = opts.endsInMs ?? 60 * 60_000;
  await ref.set({
    id: ref.id,
    vehicleId: 'v1',
    vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
    startingPrice: opts.startingPrice ?? 5000,
    bidIncrement: opts.bidIncrement ?? 500,
    startsAt: Timestamp.fromMillis(Date.now() - 60_000),
    endsAt: Timestamp.fromMillis(Date.now() + endsInMs),
    currentBid: opts.currentBid ?? 0,
    ...(opts.currentBidderUid && { currentBidderUid: opts.currentBidderUid }),
    bidCount: opts.currentBid ? 1 : 0,
    status,
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

describe('placeBid', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('rejects unauthenticated', async () => {
    const auctionId = await seedAuction();
    await expect(
      placeBidHandler({
        rawRequest: {} as never,
        data: { auctionId, amount: 5000 },
      } as CallableRequest),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects staff (non-buyer/admin)', async () => {
    const auctionId = await seedAuction();
    await expect(placeBidHandler(asStaff({ auctionId, amount: 5000 }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when auction is not live', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ status: 'scheduled' });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when auction has ended (endsAt past)', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ endsInMs: -1000 });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when amount below starting price (first bid)', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ startingPrice: 5000 });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 4500 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when amount below currentBid + increment', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({
      startingPrice: 5000,
      bidIncrement: 500,
      currentBid: 6000,
      currentBidderUid: 'other-buyer',
    });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 6300 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects self-outbid', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({
      currentBid: 6000,
      currentBidderUid: 'buyer-1',
    });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 7000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('places valid bid; updates auction; writes bid doc', async () => {
    await seedBuyer('buyer-1', 'Juan', 'Perez');
    const auctionId = await seedAuction({ startingPrice: 5000, bidIncrement: 500 });
    const result = await placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 }));
    expect(result.newCurrentBid).toBe(5000);

    const aDoc = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(aDoc.data()?.['currentBid']).toBe(5000);
    expect(aDoc.data()?.['currentBidderUid']).toBe('buyer-1');
    expect(aDoc.data()?.['bidCount']).toBe(1);

    const bidsSnap = await adminDb().collection(`auctions/${auctionId}/bids`).get();
    expect(bidsSnap.size).toBe(1);
    const bid = bidsSnap.docs[0]!.data();
    expect(bid['amount']).toBe(5000);
    expect(bid['status']).toBe('winning');
    expect(bid['buyerSnapshot'].firstName).toBe('Juan');
    expect(bid['buyerSnapshot'].lastInitial).toBe('P');
  });

  it('extends endsAt by anti-sniping window when bid lands in last 60s', async () => {
    await seedBuyer('buyer-1');
    // endsAt = now + 30s (inside the 60s window)
    const auctionId = await seedAuction({ endsInMs: 30_000 });
    const beforeEnds = (await adminDb().doc(`auctions/${auctionId}`).get()).data()![
      'endsAt'
    ] as Timestamp;
    const result = await placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 }));
    // Must have extended beyond the original endsAt
    expect(result.endsAtMs).toBeGreaterThan(beforeEnds.toMillis());
    // And to roughly now + 60s
    expect(result.endsAtMs - Date.now()).toBeGreaterThan(50_000);
  });

  it('rate-limits at 10 bids/minute', async () => {
    await seedBuyer('buyer-1');
    // Pre-seed rate limit doc with 10 recent timestamps
    const now = Date.now();
    await adminDb()
      .doc('rate_limits/bids_buyer-1')
      .set({
        timestamps: Array.from({ length: 10 }, (_, i) => now - i * 1000),
      });
    const auctionId = await seedAuction();
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('marks previous winning bid as outbid when a new bid wins', async () => {
    await seedBuyer('buyer-a');
    await seedBuyer('buyer-b');
    const auctionId = await seedAuction({ startingPrice: 5000, bidIncrement: 500 });
    await placeBidHandler(asBuyer('buyer-a', { auctionId, amount: 5000 }));
    await placeBidHandler(asBuyer('buyer-b', { auctionId, amount: 5500 }));
    const bidsSnap = await adminDb()
      .collection(`auctions/${auctionId}/bids`)
      .orderBy('amount', 'asc')
      .get();
    expect(bidsSnap.size).toBe(2);
    expect(bidsSnap.docs[0]!.data()['status']).toBe('outbid');
    expect(bidsSnap.docs[1]!.data()['status']).toBe('winning');
  });
});
```

- [ ] **Step 1.3: Wire export** in `functions/src/index.ts`:

```ts
export { placeBid } from './auctions/placeBid.js';
```

- [ ] **Step 1.4: Run tests, build, commit**

```
pnpm --filter @carbid/functions test  # expects 52 (41 prior + 11 new)
pnpm --filter @carbid/functions build
git add functions/src/auctions/placeBid.ts functions/src/auctions/placeBid.test.ts functions/src/index.ts
git commit -m "feat(functions): placeBid with anti-sniping, rate limit, self-outbid guard"
```

---

## Task 2: Bid panel UI

- [ ] **Step 2.1: i18n** — append to `messages/es.json` inside `buyer.auctions.detail`:

```json
"bidPanel": {
  "title": "Pujar",
  "minRequired": "Mínimo: USD {amount}",
  "increment": "Incremento: USD {amount}",
  "amount": "Monto (USD)",
  "submit": "Pujar",
  "submitting": "Pujando…",
  "success": "Puja registrada por USD {amount}",
  "winning": "Estás ganando.",
  "errors": {
    "notLive": "La subasta no está activa.",
    "ended": "La subasta ya cerró.",
    "tooLow": "El monto es menor al mínimo requerido.",
    "selfOutbid": "Ya tienes la puja ganadora.",
    "rateLimit": "Demasiadas pujas. Espera un momento.",
    "generic": "No se pudo registrar la puja."
  }
}
```

Same in en.json with English.

- [ ] **Step 2.2: BidPanel component** `apps/web/src/app/[locale]/(protected)/auctions/[id]/bid-panel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  auctionId: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startingPrice: number;
  currentBid: number;
  bidIncrement: number;
  currentBidderUid: string | null;
  myUid: string;
  allowManualIncrement: boolean;
}

export function BidPanel({
  auctionId,
  status,
  startingPrice,
  currentBid,
  bidIncrement,
  currentBidderUid,
  myUid,
  allowManualIncrement,
}: Props) {
  const t = useTranslations('buyer.auctions.detail.bidPanel');
  const router = useRouter();
  const minRequired = currentBid > 0 ? currentBid + bidIncrement : startingPrice;
  const [manual, setManual] = useState(String(minRequired));
  const [busy, setBusy] = useState(false);
  const isLive = status === 'live';
  const isWinning = currentBidderUid === myUid && currentBid > 0;

  async function placeBid(amount: number) {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'placeBid')({ auctionId, amount });
      toast.success(t('success', { amount: amount.toLocaleString() }));
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      const code = (e as { code?: string }).code ?? '';
      if (code.includes('resource-exhausted') || msg.includes('rate limit')) {
        toast.error(t('errors.rateLimit'));
      } else if (msg.includes('outbid yourself') || msg.includes('Cannot outbid')) {
        toast.error(t('errors.selfOutbid'));
      } else if (msg.includes('at least') || msg.includes('below')) {
        toast.error(t('errors.tooLow'));
      } else if (msg.includes('ended') || msg.includes('not live')) {
        toast.error(t('errors.notLive'));
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isLive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">{t('errors.notLive')}</p>
        </CardContent>
      </Card>
    );
  }

  const quickIncrements = [minRequired, minRequired + bidIncrement, minRequired + bidIncrement * 2];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isWinning && <p className="text-sm text-success font-medium">{t('winning')}</p>}
        <p className="text-xs text-text-muted">
          {t('minRequired', { amount: minRequired.toLocaleString() })} ·{' '}
          {t('increment', { amount: bidIncrement.toLocaleString() })}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {quickIncrements.map((amt) => (
            <Button
              key={amt}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || isWinning}
              onClick={() => placeBid(amt)}
              className="num-tab"
            >
              USD {amt.toLocaleString()}
            </Button>
          ))}
        </div>
        {allowManualIncrement && (
          <div className="space-y-2 pt-2 border-t border-text-subtle/20">
            <Label htmlFor="manual">{t('amount')}</Label>
            <div className="flex gap-2">
              <Input
                id="manual"
                type="number"
                step="1"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="num-tab"
              />
              <Button
                type="button"
                disabled={busy || isWinning}
                onClick={() => {
                  const n = Number(manual);
                  if (Number.isFinite(n)) placeBid(n);
                }}
              >
                {busy ? t('submitting') : t('submit')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2.3: Update `auction-detail-view.tsx`** to use BidPanel:

The current `auction-detail-view.tsx` has a "bidPlaceholderTitle / bidPlaceholderBody" Card after the time-left card. Replace that placeholder Card with `<BidPanel ... />`. To pass `myUid`, `currentBidderUid`, and `allowManualIncrement`, the props need to come from somewhere.

For `myUid`: read it on the server in `[id]/page.tsx` via `getCurrentUser(locale)` and pass it down. For `allowManualIncrement` and reading the bid config: also load on the server via the existing `loadAppConfigSnapshot` (Plan 3b). For `currentBidderUid`: the auction `onSnapshot` already in `auction-detail-view.tsx` should additionally track this; add `currentBidderUid` to the `live` state.

Concrete changes:

1. `[id]/page.tsx` — add:

```ts
import { getCurrentUser } from '@/lib/auth/server';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
// ...
const user = await getCurrentUser(locale);
const config = await loadAppConfigSnapshot();
return (
  <AuctionDetailView
    locale={locale}
    initial={auction}
    myUid={user.uid}
    allowManualIncrement={config.bid.allowManualIncrement}
  />
);
```

2. `auction-detail-view.tsx` props: add `myUid: string; allowManualIncrement: boolean`. Add `currentBidderUid` to the `live` state shape; populate from snapshot. Replace the placeholder Card with:

```tsx
<BidPanel
  auctionId={initial.id}
  status={live.status}
  startingPrice={initial.startingPrice}
  currentBid={live.currentBid}
  bidIncrement={initial.bidIncrement}
  currentBidderUid={live.currentBidderUid}
  myUid={myUid}
  allowManualIncrement={allowManualIncrement}
/>
```

- [ ] **Step 2.4: Build, format, commit**

```
pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/app/[locale]/'(protected)'/auctions/'[id]' apps/web/messages
git commit -m "feat(web): real-time bid panel with quick increments and manual amount"
```

---

## Task 3: Smoke test

1. Login admin (acts as both admin and buyer for this test).
2. Navigate to `/auctions` → catalog.
3. Click on the **VW Amarok** (live, ends in 24h).
4. Bid panel: see "Mínimo: USD 15,000 · Incremento: USD 500".
5. Click first quick button (USD 15,000) → toast "Puja registrada por USD 15,000". List of bids updates live with "Test A. — USD 15,000".
6. Try clicking again → toast "Ya tienes la puja ganadora" (self-outbid).
7. Open in **a private window** as a different user (or just observe — same admin will get blocked).
8. Navigate to **Tesla Model 3** (closing in 30 min). Place a bid → since within 60s window? No, 30 min is outside. Manually shorten in Firestore UI (port 4000) endsAt to 30s from now → place bid → endsAt should jump to +60s.
9. Try 11+ bids in a minute → "Demasiadas pujas".

---

## Self-Review

Spec coverage (§5 placeBid + §6 panel de puja):

- Validation, transaction, anti-sniping, self-outbid guard, rate limit ✅
- buyerSnapshot anonymized (firstName + lastInitial) ✅
- Quick increments + optional manual ✅
- Outbid status tracking on previous bid ✅

Out of scope (Plan 7):

- Auction auto-close cron
- Winner determination

---

## Execution Handoff

Recommended batches:

- Batch PP: Task 1 (CF + tests)
- Batch QQ: Task 2 (UI panel + integration)
