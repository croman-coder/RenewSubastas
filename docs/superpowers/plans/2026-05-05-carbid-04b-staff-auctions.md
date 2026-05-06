# CARBID Plan 4b — Staff Auctions

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Staff (and admin) can publish a vehicle to auction by creating an auction document with starting price, optional reserve, bid increment, and a time window. The auction starts in `scheduled` status and auto-promotes to `live` when `startsAt` is reached. Vehicle status flips `ready → in_auction`.

**Architecture:**

- New Cloud Function `createAuction` (callable, staff/admin) — validates input, transactionally writes auction doc + flips vehicle status, writes audit log.
- Status promotion `scheduled → live` is handled by the auction-closing cron (Plan 7) via the same scheduled function.
- Bids subcollection is read-only here; pujas come in Plan 6.
- Lists: server components reading via admin SDK, scoped to creator for staff.

**Spec reference:** §4 (Auction schema), §5 (`auctions.createAuction`), §6 (Staff dashboard auctions section).

**Prerequisites:** Plans 1-4a complete.

---

## File Structure

```
functions/src/
├── auctions/
│   ├── createAuction.ts
│   └── createAuction.test.ts
└── index.ts (+ export)

apps/web/src/
├── lib/staff/
│   ├── list-auctions.ts
│   └── list-ready-vehicles.ts
└── app/[locale]/(protected)/staff/auctions/
    ├── page.tsx               replaces stub
    ├── auctions-table.tsx
    ├── new/
    │   ├── page.tsx
    │   └── create-auction-form.tsx
    └── [id]/
        └── page.tsx           detail with bids stream (server fetch + client listener)
```

---

## Task 1: createAuction Cloud Function (TDD)

- [ ] **Step 1.1: Implement** `functions/src/auctions/createAuction.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z
  .object({
    vehicleId: z.string().min(1),
    startingPrice: z.number().positive(),
    reservePrice: z.number().positive().optional(),
    bidIncrement: z.number().positive(),
    startsAt: z.string().datetime(), // ISO
    endsAt: z.string().datetime(),
  })
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime() + 60_000, {
    message: 'endsAt must be at least 1 minute after startsAt',
  })
  .refine((v) => v.reservePrice === undefined || v.reservePrice >= v.startingPrice, {
    message: 'reservePrice must be >= startingPrice',
  });

export interface CreateAuctionResult {
  auctionId: string;
}

export async function createAuctionHandler(req: CallableRequest): Promise<CreateAuctionResult> {
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'staff' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only staff or admin can create auctions');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const v = parsed.data;

  const db = adminDb();
  const vehicleRef = db.doc(`vehicles/${v.vehicleId}`);

  const auctionId = await db.runTransaction(async (tx) => {
    const vSnap = await tx.get(vehicleRef);
    if (!vSnap.exists) {
      throw new HttpsError('not-found', 'Vehicle not found');
    }
    const vData = vSnap.data()!;
    if (vData['status'] !== 'ready') {
      throw new HttpsError(
        'failed-precondition',
        `Vehicle status must be "ready" (got "${vData['status']}")`,
      );
    }

    const auctionRef = db.collection('auctions').doc();
    const images = (vData['images'] as Array<{ thumbnailUrl?: string; url?: string }>) ?? [];
    const firstImg = images[0];

    tx.set(auctionRef, {
      id: auctionRef.id,
      vehicleId: v.vehicleId,
      vehicleSnapshot: {
        make: vData['make'],
        model: vData['model'],
        year: vData['year'],
        ...(firstImg?.thumbnailUrl ? { thumbnailUrl: firstImg.thumbnailUrl } : {}),
      },
      startingPrice: v.startingPrice,
      ...(v.reservePrice !== undefined && { reservePrice: v.reservePrice }),
      bidIncrement: v.bidIncrement,
      startsAt: new Date(v.startsAt),
      endsAt: new Date(v.endsAt),
      currentBid: 0,
      bidCount: 0,
      status: new Date(v.startsAt).getTime() <= Date.now() ? 'live' : 'scheduled',
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(vehicleRef, {
      status: 'in_auction',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return auctionRef.id;
  });

  await writeAuditLog({
    actorUid,
    action: 'auction.create',
    resourceType: 'auction',
    resourceId: auctionId,
    after: {
      vehicleId: v.vehicleId,
      startingPrice: v.startingPrice,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
    },
  });

  return { auctionId };
}

export const createAuction = onCall({ region: 'us-central1' }, createAuctionHandler);
```

- [ ] **Step 1.2: Tests** — 6 tests covering: rejects buyer, rejects invalid input (endsAt<startsAt, reserve<starting), rejects vehicle not found, rejects vehicle not in `ready` status, succeeds with valid input (asserts vehicle status flipped + audit log written), succeeds when startsAt is in the past (status='live').

Use the same `clearEmulators` + seed pattern as other tests. Seed vehicles with the helper:

```ts
async function seedVehicle(uid: string, status: 'draft' | 'ready' = 'ready') {
  const ref = adminDb().collection('vehicles').doc();
  await ref.set({
    id: ref.id,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    transmission: 'automatic',
    fuelType: 'gasoline',
    condition: 'used',
    description: { es: 'test' },
    images: [],
    status,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
```

- [ ] **Step 1.3: Update functions/src/index.ts** — add `export { createAuction } from './auctions/createAuction.js';`

- [ ] **Step 1.4: Run tests, build, commit**

```
pnpm --filter @carbid/functions test  # expects 41 (35 prior + 6 new)
pnpm --filter @carbid/functions build
git add functions/src/auctions functions/src/index.ts
git commit -m "feat(functions): createAuction with vehicle status flip and audit"
```

---

## Task 2: List helpers (auctions + ready vehicles)

- [ ] **Step 2.1: `apps/web/src/lib/staff/list-auctions.ts`**:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuctionListItem {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAt: number;
  endsAt: number;
  createdBy: string;
}

export interface ListAuctionsFilter {
  scopedToUid?: string;
  status?: AuctionListItem['status'];
  pageSize?: number;
  cursor?: string;
}

export interface ListAuctionsResult {
  items: AuctionListItem[];
  nextCursor: string | null;
}

export async function listAuctions(filter: ListAuctionsFilter): Promise<ListAuctionsResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('auctions').orderBy('updatedAt', 'desc');
  if (filter.scopedToUid) q = q.where('createdBy', '==', filter.scopedToUid);
  if (filter.status) q = q.where('status', '==', filter.status);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const ms = Number(filter.cursor);
    if (!Number.isNaN(ms)) q = q.startAfter(new Date(ms));
  }
  q = q.limit(pageSize + 1);
  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: AuctionListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const ms = (key: string) =>
      (data[key] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      id: d.id,
      vehicleId: (data['vehicleId'] as string) ?? '',
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      startingPrice: (data['startingPrice'] as number) ?? 0,
      currentBid: (data['currentBid'] as number) ?? 0,
      bidCount: (data['bidCount'] as number) ?? 0,
      status: (data['status'] as AuctionListItem['status']) ?? 'scheduled',
      startsAt: ms('startsAt'),
      endsAt: ms('endsAt'),
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.startsAt) : null;
  return { items, nextCursor };
}
```

- [ ] **Step 2.2: `apps/web/src/lib/staff/list-ready-vehicles.ts`**:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface ReadyVehicleOption {
  id: string;
  label: string;
}

export async function listReadyVehicles(uid: string): Promise<ReadyVehicleOption[]> {
  const db = getFirestore(getAdminApp());
  const snap = await db
    .collection('vehicles')
    .where('createdBy', '==', uid)
    .where('status', '==', 'ready')
    .limit(50)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      label: `${data['make']} ${data['model']} ${data['year']}`,
    };
  });
}
```

---

## Task 3: Auctions list page

- [ ] **Step 3.1: i18n** — append to `messages/es.json` inside `staff` namespace next to `vehicles`:

```json
"auctions": {
  "title": "Mis subastas",
  "createNew": "Crear subasta",
  "filters": { "status": "Estado", "all": "Todas" },
  "columns": {
    "vehicle": "Vehículo",
    "currentBid": "Puja actual",
    "bidCount": "Pujas",
    "status": "Estado",
    "endsAt": "Cierra"
  },
  "status": {
    "scheduled": "Programada",
    "live": "En curso",
    "ended": "Finalizada",
    "cancelled": "Cancelada"
  },
  "empty": "Aún no hay subastas. Crea una desde un vehículo en estado \"Listo\".",
  "loadMore": "Cargar más",
  "create": {
    "title": "Crear subasta",
    "vehicle": "Vehículo (debe estar en estado \"Listo\")",
    "noReadyVehicles": "No tienes vehículos en estado \"Listo\". Marca uno como listo primero.",
    "startingPrice": "Precio inicial (USD)",
    "reservePrice": "Precio reserva (USD, opcional)",
    "bidIncrement": "Incremento mínimo (USD)",
    "startsAt": "Inicio",
    "endsAt": "Fin",
    "submit": "Crear subasta",
    "submitting": "Creando…",
    "errors": { "generic": "No se pudo crear la subasta." }
  },
  "detail": {
    "back": "← Mis subastas",
    "vehicle": "Vehículo",
    "currentBid": "Puja actual",
    "noBidsYet": "Aún no hay pujas.",
    "bidsTitle": "Historial de pujas (en vivo)",
    "ends": "Cierra"
  }
}
```

And same in en.json.

- [ ] **Step 3.2: Server page** `apps/web/src/app/[locale]/(protected)/staff/auctions/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listAuctions } from '@/lib/staff/list-auctions';
import { AuctionsTable } from './auctions-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function StaffAuctionsList({ params: { locale }, searchParams }: PageProps) {
  const user = await getCurrentUser(locale);
  const status =
    searchParams?.status === 'scheduled' ||
    searchParams?.status === 'live' ||
    searchParams?.status === 'ended' ||
    searchParams?.status === 'cancelled'
      ? searchParams.status
      : undefined;
  const data = await listAuctions({
    ...(user.role === 'staff' ? { scopedToUid: user.uid } : {}),
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <AuctionsTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentStatus={status ?? null}
    />
  );
}
```

- [ ] **Step 3.3: Client table** — analogous to `vehicles-table.tsx`. Columns: thumbnail+vehicle, currentBid (`USD %`), bidCount, status badge, endsAt date+time. Filter Select with the 4 statuses. "Crear subasta" link in header.

---

## Task 4: Create auction form

- [ ] **Step 4.1: Server page** `apps/web/src/app/[locale]/(protected)/staff/auctions/new/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listReadyVehicles } from '@/lib/staff/list-ready-vehicles';
import { CreateAuctionForm } from './create-auction-form';

export default async function NewAuctionPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  const vehicles = await listReadyVehicles(user.uid);
  return <CreateAuctionForm locale={locale} vehicles={vehicles} />;
}
```

- [ ] **Step 4.2: Client form** — fields:
  - Vehicle Select (populated from `vehicles` prop; if empty, render an Alert with `noReadyVehicles` and disable the form)
  - startingPrice (number)
  - reservePrice (number, optional)
  - bidIncrement (number, default 500)
  - startsAt (datetime-local input)
  - endsAt (datetime-local input)
  - On submit: convert datetime-local strings to ISO via `new Date(...).toISOString()`. Call `httpsCallable(fb.functions, 'createAuction')(...)`. On success: redirect to `/staff/auctions/[id]`.

Implementation pattern is identical to `create-user-form.tsx` (Plan 3a). Use shadcn Input/Label/Select/Button and react-hook-form + zod.

---

## Task 5: Auction detail with live bids

- [ ] **Step 5.1: Server fetch + client listener split**:

`apps/web/src/app/[locale]/(protected)/staff/auctions/[id]/page.tsx`:

```tsx
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const snap = await getFirestore(getAdminApp()).doc(`auctions/${id}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const ms = (k: string) => (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

  return (
    <AuctionDetailView
      locale={locale}
      auctionId={id}
      initial={{
        vehicleMake: (v['make'] as string) ?? '',
        vehicleModel: (v['model'] as string) ?? '',
        vehicleYear: (v['year'] as number) ?? 0,
        thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
        startingPrice: (data['startingPrice'] as number) ?? 0,
        currentBid: (data['currentBid'] as number) ?? 0,
        bidCount: (data['bidCount'] as number) ?? 0,
        status: (data['status'] as 'scheduled' | 'live' | 'ended' | 'cancelled') ?? 'scheduled',
        endsAtMs: ms('endsAt'),
        startsAtMs: ms('startsAt'),
      }}
    />
  );
}
```

`auction-detail-view.tsx` (client) — uses `onSnapshot` from `firebase/firestore` to subscribe to `auctions/{id}/bids` ordered by `amount desc`, limit 50. Shows live list. Header shows current bid, bid count, countdown to endsAt, status badge.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';

interface BidEntry {
  id: string;
  buyerSnapshot: { firstName: string; lastInitial: string };
  amount: number;
  createdAt: number;
}

interface InitialAuction {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  thumbnailUrl: string | null;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  endsAtMs: number;
  startsAtMs: number;
}

export function AuctionDetailView({
  locale,
  auctionId,
  initial,
}: {
  locale: string;
  auctionId: string;
  initial: InitialAuction;
}) {
  const t = useTranslations('staff.auctions.detail');
  const tStatus = useTranslations('staff.auctions.status');
  const [bids, setBids] = useState<BidEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(fb.db, 'auctions', auctionId, 'bids'),
      orderBy('amount', 'desc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      setBids(
        snap.docs.map((d) => {
          const data = d.data();
          const buyer = (data['buyerSnapshot'] ?? {}) as {
            firstName?: string;
            lastInitial?: string;
          };
          const createdAt =
            (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return {
            id: d.id,
            buyerSnapshot: {
              firstName: buyer.firstName ?? '',
              lastInitial: buyer.lastInitial ?? '',
            },
            amount: (data['amount'] as number) ?? 0,
            createdAt,
          };
        }),
      );
    });
  }, [auctionId]);

  return (
    <div className="max-w-2xl space-y-6">
      <a
        href={`/${locale}/staff/auctions`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        {t('back')}
      </a>
      <header className="flex items-center gap-4">
        {initial.thumbnailUrl && (
          <img src={initial.thumbnailUrl} alt="" className="w-20 h-20 object-cover rounded" />
        )}
        <div>
          <h1 className="text-2xl font-semibold text-text-strong">
            {initial.vehicleMake} {initial.vehicleModel} {initial.vehicleYear}
          </h1>
          <Badge variant="secondary">{tStatus(initial.status)}</Badge>
        </div>
      </header>
      <section className="space-y-1">
        <p className="text-text-muted text-sm">{t('currentBid')}</p>
        <p className="text-3xl font-semibold num-tab">
          USD{' '}
          {(initial.currentBid > 0 ? initial.currentBid : initial.startingPrice).toLocaleString()}
        </p>
        <p className="text-text-muted text-sm">
          {t('ends')}: {new Date(initial.endsAtMs).toLocaleString(locale)}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-text-strong">{t('bidsTitle')}</h2>
        {bids.length === 0 ? (
          <p className="text-text-muted text-sm">{t('noBidsYet')}</p>
        ) : (
          <ul className="divide-y divide-text-subtle/20 border border-text-subtle/20 rounded">
            {bids.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {b.buyerSnapshot.firstName} {b.buyerSnapshot.lastInitial}.
                </span>
                <span className="num-tab">
                  USD {b.amount.toLocaleString()}
                  <span className="text-text-muted text-xs ml-2">
                    {new Date(b.createdAt).toLocaleTimeString(locale)}
                  </span>
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

---

## Task 6: Smoke test

1. Login as admin (or seeded staff).
2. Plan 4a: ensure at least one vehicle exists with status `ready`.
3. Navigate to `/staff/auctions` → empty state.
4. Click "Crear subasta" → form.
5. Pick the ready vehicle, startingPrice 5000, reserve 6000, increment 500, startsAt = now-1min, endsAt = +24h.
6. Submit → toast OK, redirect to `/staff/auctions/[id]`.
7. Verify badge says "En curso" (since startsAt is in the past).
8. Lista `/staff/vehicles` → vehículo ahora en "En subasta".
9. Lista `/staff/auctions` → la subasta aparece.

---

## Self-Review

Spec coverage:

- createAuction CF with role guard, vehicle precondition, transactional vehicle status flip, audit log ✅
- Staff auctions list scoped to own + status filter ✅
- Auction detail with live bids stream (onSnapshot) ✅
- "Crear subasta" form with vehicle picker (`ready` only) ✅

Out of scope (Plan 6/7):

- Actual bidding flow (placeBid)
- Auto-promote scheduled→live (will be cron)
- Auto-close ended (cron)
- Cancel auction (admin)

---

## Execution Handoff

Recommended batches:

- Batch JJ: Task 1 (CF + tests)
- Batch KK: Tasks 2-3 (helpers + list)
- Batch LL: Tasks 4-5 (create form + detail with stream)
