# CARBID Plan 7 — Auction Closing Cron + Winners + Buyer Bid History

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** A scheduled Cloud Function runs every minute to: (a) promote `scheduled → live` when `startsAt <= now`; (b) close `live → ended` when `endsAt <= now`, determine outcome (`sold` / `reserve_not_met` / `no_bids`), set `winnerUid` + `finalPrice` if sold, flip the vehicle status, and write an audit log. The buyer gets two new pages: **Mis pujas** (active/lost/won tabs) and **Mis ganadas** (won vehicles with seller contact info for off-platform coordination).

**Architecture:**

- Cloud Function `tickAuctions` is `onSchedule('every 1 minutes')` (firebase-functions v2). Idempotent — safe to run twice.
- Two batched passes per tick:
  1. Promotion: query `auctions where status == 'scheduled' AND startsAt <= now`, batch-update to `live`.
  2. Closure: query `auctions where status == 'live' AND endsAt <= now`, run a transaction per auction to determine outcome.
- Audit log entry per closure (`auction.close`).
- Vehicle status transitions:
  - `sold` → vehicle stays as `sold`
  - `reserve_not_met` / `no_bids` → vehicle returns to `ready` (so staff can re-list)
- New routes:
  - `/buyer/bids` — server fetches bids across all auctions where `buyerUid == me`, joined with auction state.
  - `/buyer/won` — auctions where `winnerUid == me`, shows seller contact info.
- Buyer sidebar in `(protected)/layout.tsx` already topbar-only; add a separate buyer subnav OR put the new pages in `/auctions` sidebar. SIMPLEST: add two new top-level paths and link from the topbar.

**Spec reference:** §5 (`auctions.closeAuction` cron), §6 buyer dashboard table (Mis pujas, Vehículos ganados).

**Prerequisites:** Plans 1-6 complete.

---

## File Structure

```
functions/src/auctions/
├── tickAuctions.ts
└── tickAuctions.test.ts
functions/src/index.ts (+ export)

apps/web/src/
├── lib/buyer/
│   ├── list-my-bids.ts
│   └── list-my-won.ts
└── app/[locale]/(protected)/
    ├── buyer/
    │   ├── bids/
    │   │   ├── page.tsx
    │   │   └── my-bids-table.tsx
    │   └── won/
    │       ├── page.tsx
    │       └── my-won-list.tsx
    └── layout.tsx (modify topbar — add 2 buyer links when role=buyer)
```

---

## Task 1: tickAuctions Cloud Function (TDD)

- [ ] **Step 1.1: Implement** `functions/src/auctions/tickAuctions.ts`:

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface TickResult {
  promoted: number;
  closed: number;
  details: Array<{
    auctionId: string;
    outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'cancelled';
    finalPrice?: number;
    winnerUid?: string;
  }>;
}

export async function runTickAuctions(now: number = Date.now()): Promise<TickResult> {
  const db = adminDb();
  const nowTs = Timestamp.fromMillis(now);

  // ---- Pass 1: promote scheduled → live ----
  const scheduledSnap = await db
    .collection('auctions')
    .where('status', '==', 'scheduled')
    .where('startsAt', '<=', nowTs)
    .limit(200)
    .get();

  let promoted = 0;
  if (scheduledSnap.size > 0) {
    const batch = db.batch();
    scheduledSnap.docs.forEach((d) => {
      batch.update(d.ref, {
        status: 'live',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    promoted = scheduledSnap.size;
  }

  // ---- Pass 2: close live with endsAt past ----
  const liveSnap = await db
    .collection('auctions')
    .where('status', '==', 'live')
    .where('endsAt', '<=', nowTs)
    .limit(200)
    .get();

  const details: TickResult['details'] = [];

  for (const doc of liveSnap.docs) {
    const result = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists) return null;
      const a = fresh.data()!;

      // Recheck — another tick may have closed it.
      if (a['status'] !== 'live') return null;
      const endsAt = a['endsAt'] as Timestamp;
      if (endsAt.toMillis() > now) return null;

      const currentBid = (a['currentBid'] as number) ?? 0;
      const reservePrice = a['reservePrice'] as number | undefined;
      const winnerUid = a['currentBidderUid'] as string | undefined;

      let outcome: 'sold' | 'reserve_not_met' | 'no_bids';
      if (currentBid <= 0 || !winnerUid) {
        outcome = 'no_bids';
      } else if (reservePrice !== undefined && currentBid < reservePrice) {
        outcome = 'reserve_not_met';
      } else {
        outcome = 'sold';
      }

      const auctionUpdate: Record<string, unknown> = {
        status: 'ended',
        outcome,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (outcome === 'sold' && winnerUid) {
        auctionUpdate['winnerUid'] = winnerUid;
        auctionUpdate['finalPrice'] = currentBid;
      }
      tx.update(doc.ref, auctionUpdate);

      // Vehicle status transition.
      const vehicleId = a['vehicleId'] as string;
      if (vehicleId) {
        const vehicleRef = db.doc(`vehicles/${vehicleId}`);
        tx.update(vehicleRef, {
          status: outcome === 'sold' ? 'sold' : 'ready',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        auctionId: doc.id,
        outcome,
        ...(outcome === 'sold' && winnerUid && { finalPrice: currentBid, winnerUid }),
      };
    });

    if (result) {
      details.push(result);
      await writeAuditLog({
        actorUid: 'system',
        action: 'auction.close',
        resourceType: 'auction',
        resourceId: result.auctionId,
        after: result as Record<string, unknown>,
      });
    }
  }

  return { promoted, closed: details.length, details };
}

export const tickAuctions = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1' },
  async () => {
    const r = await runTickAuctions();
    console.log(`tickAuctions: promoted=${r.promoted} closed=${r.closed}`);
  },
);
```

- [ ] **Step 1.2: Test** — 6 cases:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from '../lib/admin.js';
import { runTickAuctions } from './tickAuctions.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

async function clearAll() {
  for (const c of ['auctions', 'vehicles', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

interface SeedAuctionOpts {
  status: 'scheduled' | 'live' | 'ended';
  startsInMs: number;
  endsInMs: number;
  startingPrice?: number;
  currentBid?: number;
  currentBidderUid?: string;
  reservePrice?: number;
}

async function seedAuctionAndVehicle(
  opts: SeedAuctionOpts,
): Promise<{ auctionId: string; vehicleId: string }> {
  const vRef = adminDb().collection('vehicles').doc();
  await vRef.set({
    id: vRef.id,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    transmission: 'automatic',
    fuelType: 'gasoline',
    condition: 'used',
    description: { es: 'test' },
    images: [],
    status: opts.status === 'scheduled' ? 'in_auction' : 'in_auction',
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const aRef = adminDb().collection('auctions').doc();
  await aRef.set({
    id: aRef.id,
    vehicleId: vRef.id,
    vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
    startingPrice: opts.startingPrice ?? 5000,
    bidIncrement: 500,
    startsAt: Timestamp.fromMillis(Date.now() + opts.startsInMs),
    endsAt: Timestamp.fromMillis(Date.now() + opts.endsInMs),
    currentBid: opts.currentBid ?? 0,
    ...(opts.currentBidderUid && { currentBidderUid: opts.currentBidderUid }),
    ...(opts.reservePrice !== undefined && { reservePrice: opts.reservePrice }),
    bidCount: opts.currentBid ? 1 : 0,
    status: opts.status,
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { auctionId: aRef.id, vehicleId: vRef.id };
}

describe('runTickAuctions', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('promotes scheduled to live when startsAt is past', async () => {
    const { auctionId } = await seedAuctionAndVehicle({
      status: 'scheduled',
      startsInMs: -60_000,
      endsInMs: 24 * 3600_000,
    });
    const r = await runTickAuctions();
    expect(r.promoted).toBe(1);
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['status']).toBe('live');
  });

  it('does not promote scheduled with future startsAt', async () => {
    await seedAuctionAndVehicle({
      status: 'scheduled',
      startsInMs: 60_000,
      endsInMs: 24 * 3600_000,
    });
    const r = await runTickAuctions();
    expect(r.promoted).toBe(0);
  });

  it('closes live with no bids → outcome=no_bids, vehicle=ready', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
    });
    const r = await runTickAuctions();
    expect(r.closed).toBe(1);
    expect(r.details[0]?.outcome).toBe('no_bids');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['status']).toBe('ended');
    expect(a.data()?.['outcome']).toBe('no_bids');
    expect(a.data()?.['winnerUid']).toBeUndefined();
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('ready');
  });

  it('closes live with bid >= reserve → outcome=sold', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      startingPrice: 5000,
      reservePrice: 6000,
      currentBid: 7000,
      currentBidderUid: 'buyer-winner',
    });
    const r = await runTickAuctions();
    expect(r.details[0]?.outcome).toBe('sold');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['outcome']).toBe('sold');
    expect(a.data()?.['winnerUid']).toBe('buyer-winner');
    expect(a.data()?.['finalPrice']).toBe(7000);
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('sold');
  });

  it('closes live with bid below reserve → outcome=reserve_not_met, vehicle=ready', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      startingPrice: 5000,
      reservePrice: 8000,
      currentBid: 6000,
      currentBidderUid: 'buyer-loser',
    });
    const r = await runTickAuctions();
    expect(r.details[0]?.outcome).toBe('reserve_not_met');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['winnerUid']).toBeUndefined();
    expect(a.data()?.['finalPrice']).toBeUndefined();
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('ready');
  });

  it('writes audit log per closure', async () => {
    await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      currentBid: 8000,
      currentBidderUid: 'buyer-1',
    });
    await runTickAuctions();
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.close')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('system');
  });
});
```

- [ ] **Step 1.3: Update functions/src/index.ts** — add `export { tickAuctions } from './auctions/tickAuctions.js';`

- [ ] **Step 1.4: Run tests, build, commit**

```
pnpm --filter @carbid/functions test  # expects 58 (52 prior + 6 new)
pnpm --filter @carbid/functions build
git add functions/src/auctions/tickAuctions.ts functions/src/auctions/tickAuctions.test.ts functions/src/index.ts
git commit -m "feat(functions): tickAuctions cron — promote scheduled, close live with outcome"
```

---

## Task 2: Buyer "Mis pujas" page

- [ ] **Step 2.1: i18n** — append to `messages/es.json` inside `buyer`:

```json
"bids": {
  "title": "Mis pujas",
  "tabs": {
    "winning": "Ganando",
    "outbid": "Superado",
    "won": "Ganadas",
    "lost": "Perdidas"
  },
  "columns": {
    "vehicle": "Vehículo",
    "myBid": "Mi puja",
    "currentBid": "Puja actual",
    "status": "Estado",
    "endsAt": "Cierra"
  },
  "empty": "No tienes pujas en esta categoría."
},
"won": {
  "title": "Vehículos ganados",
  "subtitle": "Coordina la entrega y el pago directamente con el vendedor.",
  "columns": {
    "vehicle": "Vehículo",
    "finalPrice": "Precio final",
    "endedAt": "Cerró",
    "seller": "Vendedor"
  },
  "empty": "Aún no has ganado ninguna subasta."
}
```

Same in en.json.

- [ ] **Step 2.2: Helper** `apps/web/src/lib/buyer/list-my-bids.ts` — uses Firestore collection-group query on `bids` subcollection:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface MyBidEntry {
  bidId: string;
  auctionId: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  myBid: number;
  status: 'winning' | 'outbid' | 'rejected' | 'valid';
  auctionStatus: 'scheduled' | 'live' | 'ended' | 'cancelled';
  outcome: 'sold' | 'reserve_not_met' | 'no_bids' | null;
  iAmWinner: boolean;
  currentBid: number;
  endsAtMs: number;
  bidCreatedAtMs: number;
}

export async function listMyBids(uid: string): Promise<MyBidEntry[]> {
  const db = getFirestore(getAdminApp());
  // Collection group query across all bids subcollections
  const bidsSnap = await db
    .collectionGroup('bids')
    .where('buyerUid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  // Hydrate each with the parent auction
  const auctionIds = Array.from(new Set(bidsSnap.docs.map((d) => d.ref.parent.parent!.id)));
  const auctionDocs: Record<string, FirebaseFirestore.DocumentData> = {};
  if (auctionIds.length > 0) {
    const refs = auctionIds.map((id) => db.doc(`auctions/${id}`));
    const fetched = await db.getAll(...refs);
    fetched.forEach((d) => {
      if (d.exists) auctionDocs[d.id] = d.data()!;
    });
  }

  return bidsSnap.docs.map((d) => {
    const bid = d.data();
    const auctionId = d.ref.parent.parent!.id;
    const a = auctionDocs[auctionId] ?? {};
    const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const ms = (k: string) => (a[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      bidId: d.id,
      auctionId,
      vehicleId: (a['vehicleId'] as string) ?? '',
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      myBid: (bid['amount'] as number) ?? 0,
      status: (bid['status'] as MyBidEntry['status']) ?? 'valid',
      auctionStatus: (a['status'] as MyBidEntry['auctionStatus']) ?? 'ended',
      outcome: (a['outcome'] as MyBidEntry['outcome']) ?? null,
      iAmWinner: (a['winnerUid'] as string | undefined) === uid,
      currentBid: (a['currentBid'] as number) ?? 0,
      endsAtMs: ms('endsAt'),
      bidCreatedAtMs:
        (bid['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
    };
  });
}
```

> NOTE: `collectionGroup('bids')` requires a Firestore index on `bids` collection group with `buyerUid asc, createdAt desc`. Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "bids",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "buyerUid", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 2.3: Server page** `apps/web/src/app/[locale]/(protected)/buyer/bids/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { MyBidsTable } from './my-bids-table';

interface Props {
  params: { locale: string };
  searchParams?: { tab?: string };
}

export default async function MyBidsPage({ params: { locale }, searchParams }: Props) {
  const user = await getCurrentUser(locale);
  const all = await listMyBids(user.uid);
  const tab = (
    searchParams?.tab === 'outbid' || searchParams?.tab === 'won' || searchParams?.tab === 'lost'
      ? searchParams.tab
      : 'winning'
  ) as 'winning' | 'outbid' | 'won' | 'lost';

  // Deduplicate to one row per auction (keep buyer's latest bid)
  const byAuction = new Map<string, (typeof all)[number]>();
  for (const b of all) {
    if (!byAuction.has(b.auctionId)) byAuction.set(b.auctionId, b);
  }
  const dedup = Array.from(byAuction.values());

  const filtered = dedup.filter((b) => {
    if (tab === 'winning') return b.auctionStatus === 'live' && b.status === 'winning';
    if (tab === 'outbid') return b.auctionStatus === 'live' && b.status === 'outbid';
    if (tab === 'won') return b.auctionStatus === 'ended' && b.iAmWinner;
    if (tab === 'lost') return b.auctionStatus === 'ended' && !b.iAmWinner;
    return false;
  });

  return <MyBidsTable locale={locale} items={filtered} currentTab={tab} />;
}
```

- [ ] **Step 2.4: Client table** `my-bids-table.tsx` — Tabs (winning/outbid/won/lost) + Table. Columns: vehicle (thumbnail+name), myBid, currentBid, status, endsAt. Empty state with i18n.

(Same patterns as previous tables — reuse the Tabs from shadcn.)

- [ ] **Step 2.5: Build + commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/buyer/list-my-bids.ts apps/web/src/app/[locale]/'(protected)'/buyer/bids apps/web/messages firestore.indexes.json
git commit -m "feat(web): buyer 'Mis pujas' with winning/outbid/won/lost tabs"
```

---

## Task 3: Buyer "Mis ganadas" page

- [ ] **Step 3.1: Helper** `apps/web/src/lib/buyer/list-my-won.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface MyWonAuction {
  auctionId: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  finalPrice: number;
  endedAtMs: number;
  sellerUid: string;
  sellerName: string;
  sellerEmail: string;
}

export async function listMyWon(uid: string): Promise<MyWonAuction[]> {
  const db = getFirestore(getAdminApp());
  const snap = await db
    .collection('auctions')
    .where('winnerUid', '==', uid)
    .where('status', '==', 'ended')
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  const sellerIds = Array.from(
    new Set(snap.docs.map((d) => (d.data()['createdBy'] as string) ?? '').filter(Boolean)),
  );
  const sellerDocs: Record<string, FirebaseFirestore.DocumentData> = {};
  if (sellerIds.length > 0) {
    const refs = sellerIds.map((id) => db.doc(`users/${id}`));
    const fetched = await db.getAll(...refs);
    fetched.forEach((d) => {
      if (d.exists) sellerDocs[d.id] = d.data()!;
    });
  }

  return snap.docs.map((d) => {
    const a = d.data();
    const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const sellerUid = (a['createdBy'] as string) ?? '';
    const sellerData = sellerDocs[sellerUid] ?? {};
    const sellerProfile = (sellerData['profile'] ?? {}) as Record<string, string>;
    const ms = (a['updatedAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      auctionId: d.id,
      vehicleId: (a['vehicleId'] as string) ?? '',
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      finalPrice: (a['finalPrice'] as number) ?? 0,
      endedAtMs: ms,
      sellerUid,
      sellerName: `${sellerProfile['firstName'] ?? ''} ${sellerProfile['lastName'] ?? ''}`.trim(),
      sellerEmail: (sellerData['email'] as string) ?? '',
    };
  });
}
```

- [ ] **Step 3.2: Server page + client list** `apps/web/src/app/[locale]/(protected)/buyer/won/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listMyWon } from '@/lib/buyer/list-my-won';
import { getTranslations } from 'next-intl/server';

export default async function MyWonPage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getCurrentUser(locale);
  const items = await listMyWon(user.uid);
  const t = await getTranslations('buyer.won');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      {items.length === 0 ? (
        <div className="border border-text-subtle/20 rounded-lg p-12 text-center text-text-muted">
          {t('empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((w) => (
            <li
              key={w.auctionId}
              className="border border-text-subtle/20 rounded-lg p-4 flex items-center gap-4"
            >
              {w.thumbnailUrl && (
                <img src={w.thumbnailUrl} alt="" className="w-20 h-20 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-strong">
                  {w.make} {w.model} {w.year}
                </p>
                <p className="text-sm text-text-muted">
                  {t('columns.finalPrice')}: USD {w.finalPrice.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted">
                  {t('columns.seller')}: {w.sellerName} · {w.sellerEmail}
                </p>
              </div>
              <span className="text-xs text-text-muted num-tab">
                {new Date(w.endedAtMs).toLocaleDateString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3.3: Add buyer links to topbar** — modify `apps/web/src/app/[locale]/(protected)/layout.tsx`:

Currently the topbar shows the wordmark + role badge + email + Logout. When `user.role === 'buyer'`, add two extra links: "Subastas" (already implicit via wordmark→home) → just add "Mis pujas" + "Mis ganadas" between role badge and email.

Concrete change to the right-side div of the header:

```tsx
<div className="flex items-center gap-3 text-sm">
  {user.role === 'buyer' && (
    <>
      <a href={`/${locale}/buyer/bids`} className="text-text-muted hover:text-text-strong">
        {tBuyer('navBids')}
      </a>
      <a href={`/${locale}/buyer/won`} className="text-text-muted hover:text-text-strong">
        {tBuyer('navWon')}
      </a>
    </>
  )}
  <a href={`/${locale}/settings/profile`} className="text-text-muted hover:text-text-strong">
    {t('settings')}
  </a>
  <span className="text-text-muted">{user.email}</span>
  <LogoutButton locale={locale} />
</div>
```

Add to es.json under `buyer`:

```json
"navBids": "Mis pujas",
"navWon": "Ganadas"
```

Same in en.json.

The layout component is async (server) so use `getTranslations`:

```tsx
const tBuyer = await getTranslations('buyer');
```

- [ ] **Step 3.4: Build + commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/buyer/list-my-won.ts apps/web/src/app/[locale]/'(protected)'/buyer/won apps/web/src/app/[locale]/'(protected)'/layout.tsx apps/web/messages
git commit -m "feat(web): buyer 'Mis ganadas' page + topbar links"
```

---

## Task 4: Smoke test

1. Login admin (acts as buyer for placing bids).
2. Place a bid on the VW Amarok.
3. Force-close: in Firestore Emulator UI (port 4000), edit the auction's `endsAt` to a past timestamp.
4. Wait up to 60s for the cron to fire (or call `runTickAuctions` directly via the firebase functions shell). Alternative for faster smoke: temporarily change schedule to `every 30 seconds` in dev.
5. Refresh — auction status should be `ended`, outcome `sold` (assuming bid placed), vehicle `sold`.
6. Buyer topbar: navigate to "Mis pujas" → see the won bid in "Ganadas" tab.
7. "Ganadas" page → see the vehicle card with seller name + email.

---

## Self-Review

Spec coverage:

- `auctions.closeAuction` cron with outcome determination ✅
- Vehicle status transitions per outcome ✅
- Audit log on closure ✅
- Buyer "Mis pujas" with 4 tabs ✅
- Buyer "Mis ganadas" with seller contact ✅
- Topbar buyer links ✅

Out of scope:

- Email notifications to winner/losers (Plan 9 with email service decision)
- Cancel auction (admin manual — Plan 9)

---

## Execution Handoff

Recommended batches:

- Batch RR: Task 1 (cron + tests)
- Batch SS: Tasks 2-3 (buyer pages)
