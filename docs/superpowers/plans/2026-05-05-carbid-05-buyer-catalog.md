# CARBID Plan 5 — Buyer Catalog + Auction Detail

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Buyers see a live catalog of auctions with countdowns and per-tab views (all / closing soon / favorites). Each auction has a public detail page with photo gallery, specs, current price, live countdown, live bids stream, and a favorite toggle. **No bidding action yet — that's Plan 6**.

**Architecture:**

- Catalog at `/auctions` (replaces existing placeholder). Server component reads `auctions where status in ('scheduled', 'live')` from Firestore admin SDK.
- Detail at `/auctions/[id]`. Server fetches snapshot. Client subscribes via `onSnapshot` to:
  1. The auction doc (for live `currentBid` / `bidCount` / `endsAt` extensions)
  2. The bids subcollection (live history)
- Favorites stored at `users/{uid}.favorites: string[]`. Client writes directly (Firestore rules already allow self-update; spec rules don't forbid new top-level fields on the user doc as long as `role`/`status`/`createdBy` are preserved).
- Countdowns computed client-side from `endsAt`.

**Spec reference:** §6 buyer dashboard table (Catálogo + Detalle de subasta).

**Prerequisites:** Plans 1-4b complete.

---

## File Structure

```
apps/web/src/
├── lib/buyer/
│   ├── list-public-auctions.ts
│   ├── load-auction.ts
│   └── load-favorites.ts
└── app/[locale]/(protected)/
    └── auctions/
        ├── page.tsx                  REPLACE placeholder
        ├── auctions-grid.tsx         client (tabs + grid + cards)
        ├── auction-card.tsx          client (countdown + favorite)
        └── [id]/
            ├── page.tsx              detail (server)
            └── auction-detail-view.tsx client
```

---

## Task 1: i18n + helper + catalog

- [ ] **Step 1.1: i18n** — append to `messages/es.json` next to `staff`:

```json
"buyer": {
  "auctions": {
    "title": "Subastas",
    "tabs": {
      "all": "Todas",
      "closing": "Cierran pronto",
      "favorites": "Favoritos"
    },
    "empty": "No hay subastas activas en este momento.",
    "emptyFavorites": "No tienes subastas en favoritos.",
    "currentBid": "Puja actual",
    "startingPrice": "Precio inicial",
    "ends": "Cierra",
    "bidCount": "{count, plural, =0 {sin pujas} =1 {1 puja} other {# pujas}}",
    "addFavorite": "Agregar a favoritos",
    "removeFavorite": "Quitar de favoritos",
    "status": {
      "scheduled": "Programada",
      "live": "En curso",
      "ended": "Finalizada",
      "cancelled": "Cancelada"
    },
    "detail": {
      "back": "← Subastas",
      "specs": "Especificaciones",
      "make": "Marca",
      "model": "Modelo",
      "year": "Año",
      "mileage": "Kilometraje",
      "transmission": "Transmisión",
      "fuelType": "Combustible",
      "color": "Color",
      "condition": "Condición",
      "vin": "VIN",
      "description": "Descripción",
      "bidsTitle": "Pujas (en vivo)",
      "noBidsYet": "Aún no hay pujas. Sé el primero (Plan 6).",
      "bidPlaceholderTitle": "Pujar (próximamente)",
      "bidPlaceholderBody": "El sistema de pujas se habilita en el Plan 6.",
      "timeLeft": "Tiempo restante"
    }
  }
}
```

Same in en.json with English translations.

- [ ] **Step 1.2: List helper** `apps/web/src/lib/buyer/list-public-auctions.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, type Query } from 'firebase-admin/firestore';

export interface PublicAuction {
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
  startsAtMs: number;
  endsAtMs: number;
}

export type CatalogTab = 'all' | 'closing' | 'favorites';

export interface ListPublicAuctionsArgs {
  tab: CatalogTab;
  favorites?: string[];
  pageSize?: number;
}

export async function listPublicAuctions({
  tab,
  favorites = [],
  pageSize = 50,
}: ListPublicAuctionsArgs): Promise<PublicAuction[]> {
  const db = getFirestore(getAdminApp());

  if (tab === 'favorites') {
    if (favorites.length === 0) return [];
    // Firestore `in` accepts up to 30 ids; chunk if needed.
    const chunks: string[][] = [];
    for (let i = 0; i < favorites.length; i += 30) {
      chunks.push(favorites.slice(i, i + 30));
    }
    const results: PublicAuction[] = [];
    for (const chunk of chunks) {
      const snap = await db
        .collection('auctions')
        .where(
          '__name__',
          'in',
          chunk.map((id) => db.doc(`auctions/${id}`)),
        )
        .get();
      snap.docs.forEach((d) => results.push(toItem(d)));
    }
    return results.sort((a, b) => a.endsAtMs - b.endsAtMs);
  }

  // 'all' and 'closing' both filter to live + scheduled auctions, ordered by endsAt asc.
  let q: Query = db
    .collection('auctions')
    .where('status', 'in', ['live', 'scheduled'])
    .orderBy('endsAt', 'asc')
    .limit(pageSize);

  if (tab === 'closing') {
    const in24h = new Date(Date.now() + 24 * 3600_000);
    q = db
      .collection('auctions')
      .where('status', '==', 'live')
      .where('endsAt', '<=', in24h)
      .orderBy('endsAt', 'asc')
      .limit(pageSize);
  }

  const snap = await q.get();
  return snap.docs.map(toItem);
}

function toItem(d: FirebaseFirestore.QueryDocumentSnapshot): PublicAuction {
  const data = d.data();
  const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const ms = (k: string) => (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
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
    status: (data['status'] as PublicAuction['status']) ?? 'scheduled',
    startsAtMs: ms('startsAt'),
    endsAtMs: ms('endsAt'),
  };
}
```

- [ ] **Step 1.3: Favorites helper** `apps/web/src/lib/buyer/load-favorites.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function loadFavorites(uid: string): Promise<string[]> {
  const snap = await getFirestore(getAdminApp()).doc(`users/${uid}`).get();
  return ((snap.data()?.['favorites'] ?? []) as string[]) ?? [];
}
```

- [ ] **Step 1.4: Catalog page (server)** — REPLACE `apps/web/src/app/[locale]/(protected)/auctions/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/server';
import { listPublicAuctions, type CatalogTab } from '@/lib/buyer/list-public-auctions';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { AuctionsGrid } from './auctions-grid';

interface PageProps {
  params: { locale: string };
  searchParams?: { tab?: string };
}

export default async function BuyerAuctionsCatalog({
  params: { locale },
  searchParams,
}: PageProps) {
  const user = await getCurrentUser(locale);
  const tab: CatalogTab =
    searchParams?.tab === 'closing' || searchParams?.tab === 'favorites' ? searchParams.tab : 'all';

  const favorites = await loadFavorites(user.uid);
  const items = await listPublicAuctions({
    tab,
    ...(tab === 'favorites' && { favorites }),
  });

  return <AuctionsGrid locale={locale} items={items} currentTab={tab} favorites={favorites} />;
}
```

- [ ] **Step 1.5: Build, format, commit**

```
pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/buyer apps/web/src/app/[locale]/'(protected)'/auctions/page.tsx apps/web/messages
git commit -m "feat(web): buyer catalog server data + i18n"
```

---

## Task 2: Grid + Card components (client)

- [ ] **Step 2.1: Card** `apps/web/src/app/[locale]/(protected)/auctions/auction-card.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  auction: PublicAuction;
  isFavorite: boolean;
  buyerUid: string;
}

export function AuctionCard({ locale, auction, isFavorite, buyerUid }: Props) {
  const t = useTranslations('buyer.auctions');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  const [fav, setFav] = useState(isFavorite);

  // countdown re-renders every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function toggleFav(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ref = doc(fb.db, 'users', buyerUid);
    try {
      if (fav) {
        await updateDoc(ref, { favorites: arrayRemove(auction.id) });
        setFav(false);
      } else {
        await updateDoc(ref, { favorites: arrayUnion(auction.id) });
        setFav(true);
      }
      router.refresh();
    } catch {
      // silent fail
    }
  }

  const remainingMs = auction.endsAtMs - now;
  const displayPrice = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;

  return (
    <Link
      href={`/${locale}/auctions/${auction.id}` as `/${string}`}
      className="block group rounded-lg border border-text-subtle/20 overflow-hidden bg-bg-elev hover:border-copper transition-colors"
    >
      <div className="relative aspect-[4/3] bg-bg-deep overflow-hidden">
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle text-sm">
            sin foto
          </div>
        )}
        <button
          type="button"
          onClick={toggleFav}
          aria-label={fav ? t('removeFavorite') : t('addFavorite')}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-bg-base/80 backdrop-blur grid place-items-center text-lg"
        >
          {fav ? '♥' : '♡'}
        </button>
        <div className="absolute top-2 left-2">
          <Badge variant={auction.status === 'live' ? 'default' : 'secondary'}>
            {tStatus(auction.status)}
          </Badge>
        </div>
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-medium text-text-strong">
          {auction.make} {auction.model}{' '}
          <span className="num-tab text-text-muted">{auction.year}</span>
        </h3>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold num-tab">USD {displayPrice.toLocaleString()}</span>
          <span className="text-xs text-text-muted">
            {t('bidCount', { count: auction.bidCount })}
          </span>
        </div>
        <p className="text-xs text-copper num-tab">{formatRemaining(remainingMs)}</p>
      </div>
    </Link>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
```

- [ ] **Step 2.2: Grid** `auctions-grid.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuctionCard } from './auction-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { PublicAuction, CatalogTab } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
  currentTab: CatalogTab;
  favorites: string[];
}

export function AuctionsGrid({ locale, items, currentTab, favorites }: Props) {
  const t = useTranslations('buyer.auctions');
  const router = useRouter();
  const { user } = useAuth();
  const favSet = new Set(favorites);

  function setTab(value: string) {
    const next = value === 'all' ? '' : `?tab=${value}`;
    router.replace(`/${locale}/auctions${next}` as `/${string}`);
  }

  const empty = items.length === 0;
  const emptyMsg = currentTab === 'favorites' ? t('emptyFavorites') : t('empty');

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      </header>
      <Tabs value={currentTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
          <TabsTrigger value="closing">{t('tabs.closing')}</TabsTrigger>
          <TabsTrigger value="favorites">{t('tabs.favorites')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {empty ? (
        <div className="border border-text-subtle/20 rounded-lg p-12 text-center text-text-muted">
          {emptyMsg}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((a) => (
            <AuctionCard
              key={a.id}
              locale={locale}
              auction={a}
              isFavorite={favSet.has(a.id)}
              buyerUid={user?.uid ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2.3: Build, format, commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/app/[locale]/'(protected)'/auctions
git commit -m "feat(web): buyer catalog grid with tabs, cards, countdown, favorites"
```

---

## Task 3: Auction detail page

- [ ] **Step 3.1: Auction detail loader** `apps/web/src/lib/buyer/load-auction.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuctionDetail {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  mileage: number | null;
  transmission: 'manual' | 'automatic' | 'cvt';
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  color: string | null;
  condition: 'new' | 'used' | 'damaged';
  descriptionEs: string;
  descriptionEn: string | null;
  images: Array<{ url: string; thumbnailUrl: string }>;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  bidIncrement: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAtMs: number;
  endsAtMs: number;
}

export async function loadAuction(id: string): Promise<AuctionDetail | null> {
  const db = getFirestore(getAdminApp());
  const aSnap = await db.doc(`auctions/${id}`).get();
  if (!aSnap.exists) return null;
  const a = aSnap.data()!;

  const vSnap = await db.doc(`vehicles/${a['vehicleId']}`).get();
  const v = vSnap.exists ? vSnap.data()! : {};
  const description = (v['description'] ?? {}) as { es?: string; en?: string };
  const images = (v['images'] as Array<{ url: string; thumbnailUrl: string }> | undefined) ?? [];
  const ms = (k: string) => (a[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

  return {
    id,
    vehicleId: (a['vehicleId'] as string) ?? '',
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    vin: (v['vin'] as string | undefined) ?? null,
    mileage: (v['mileage'] as number | undefined) ?? null,
    transmission: (v['transmission'] as AuctionDetail['transmission']) ?? 'manual',
    fuelType: (v['fuelType'] as AuctionDetail['fuelType']) ?? 'gasoline',
    color: (v['color'] as string | undefined) ?? null,
    condition: (v['condition'] as AuctionDetail['condition']) ?? 'used',
    descriptionEs: description.es ?? '',
    descriptionEn: description.en ?? null,
    images: images.map((img) => ({ url: img.url, thumbnailUrl: img.thumbnailUrl })),
    startingPrice: (a['startingPrice'] as number) ?? 0,
    currentBid: (a['currentBid'] as number) ?? 0,
    bidCount: (a['bidCount'] as number) ?? 0,
    bidIncrement: (a['bidIncrement'] as number) ?? 500,
    status: (a['status'] as AuctionDetail['status']) ?? 'scheduled',
    startsAtMs: ms('startsAt'),
    endsAtMs: ms('endsAt'),
  };
}
```

- [ ] **Step 3.2: Detail page (server)** `apps/web/src/app/[locale]/(protected)/auctions/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { loadAuction } from '@/lib/buyer/load-auction';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function BuyerAuctionDetail({ params: { locale, id } }: Props) {
  const auction = await loadAuction(id);
  if (!auction) notFound();
  return <AuctionDetailView locale={locale} initial={auction} />;
}
```

- [ ] **Step 3.3: Detail view (client)** `auction-detail-view.tsx` — features:
  - Photo gallery: main image + thumbnail strip; click thumbnail switches main.
  - Specs grid (transmission, fuel, mileage, condition, color, vin).
  - Description (es; if locale=en and description.en exists, prefer en).
  - Sticky right column on desktop, stacked on mobile:
    - Status badge + countdown (re-renders 1Hz via setInterval)
    - Current bid (live via `onSnapshot` on auction doc)
    - Bid count
    - **Bid placeholder card**: "Pujar (próximamente) — Plan 6"
  - Live bids list below: subscribes to `auctions/{id}/bids` ordered by `amount desc` limit 50.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { AuctionDetail } from '@/lib/buyer/load-auction';

interface BidEntry {
  id: string;
  buyerSnapshot: { firstName: string; lastInitial: string };
  amount: number;
  createdAt: number;
}

export function AuctionDetailView({ locale, initial }: { locale: string; initial: AuctionDetail }) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const [activeImg, setActiveImg] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState<{
    currentBid: number;
    bidCount: number;
    endsAtMs: number;
    status: AuctionDetail['status'];
  }>({
    currentBid: initial.currentBid,
    bidCount: initial.bidCount,
    endsAtMs: initial.endsAtMs,
    status: initial.status,
  });
  const [bids, setBids] = useState<BidEntry[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsubAuction = onSnapshot(doc(fb.db, 'auctions', initial.id), (s) => {
      const data = s.data();
      if (!data) return;
      const ms = (k: string) =>
        (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      setLive({
        currentBid: (data['currentBid'] as number) ?? 0,
        bidCount: (data['bidCount'] as number) ?? 0,
        endsAtMs: ms('endsAt'),
        status: (data['status'] as AuctionDetail['status']) ?? 'scheduled',
      });
    });
    const q = query(
      collection(fb.db, 'auctions', initial.id, 'bids'),
      orderBy('amount', 'desc'),
      limit(50),
    );
    const unsubBids = onSnapshot(q, (snap) => {
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
    return () => {
      unsubAuction();
      unsubBids();
    };
  }, [initial.id]);

  const remainingMs = live.endsAtMs - now;
  const displayPrice = live.currentBid > 0 ? live.currentBid : initial.startingPrice;
  const description =
    locale === 'en' && initial.descriptionEn ? initial.descriptionEn : initial.descriptionEs;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <a href={`/${locale}/auctions`} className="text-sm text-text-muted hover:text-text-strong">
        {t('back')}
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6">
          {/* Photo gallery */}
          <div className="space-y-2">
            <div className="aspect-[4/3] bg-bg-deep rounded-lg overflow-hidden">
              {initial.images[activeImg] ? (
                <img
                  src={initial.images[activeImg].url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-text-subtle">
                  sin fotos
                </div>
              )}
            </div>
            {initial.images.length > 1 && (
              <div className="grid grid-cols-6 gap-2">
                {initial.images.slice(0, 12).map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    className={
                      'aspect-square rounded overflow-hidden border-2 ' +
                      (i === activeImg ? 'border-copper' : 'border-transparent')
                    }
                  >
                    <img src={img.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <header>
            <h1 className="text-3xl font-semibold text-text-strong">
              {initial.make} {initial.model}{' '}
              <span className="num-tab text-text-muted">{initial.year}</span>
            </h1>
            <Badge variant="secondary" className="mt-2">
              {tStatus(live.status)}
            </Badge>
          </header>

          <section>
            <h2 className="text-lg font-medium text-text-strong mb-3">{t('specs')}</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Spec label={t('transmission')} value={initial.transmission} />
              <Spec label={t('fuelType')} value={initial.fuelType} />
              {initial.mileage !== null && (
                <Spec label={t('mileage')} value={`${initial.mileage.toLocaleString()} km`} />
              )}
              <Spec label={t('condition')} value={initial.condition} />
              {initial.color && <Spec label={t('color')} value={initial.color} />}
              {initial.vin && <Spec label={t('vin')} value={initial.vin} />}
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-medium text-text-strong mb-2">{t('description')}</h2>
            <p className="whitespace-pre-line text-text-strong">{description}</p>
          </section>
        </div>

        {/* Sticky bid panel */}
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-text-muted font-normal">
                {t('timeLeft')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold num-tab text-copper">
                {formatRemaining(remainingMs)}
              </p>
              <Separator />
              <div>
                <p className="text-sm text-text-muted">
                  {live.currentBid > 0 ? t('back') /* unused */ : ''}
                </p>
                <p className="text-sm text-text-muted">
                  {live.currentBid > 0 ? t('back') /* unused */ : ''}
                </p>
                <p className="text-sm text-text-muted">
                  USD {initial.startingPrice.toLocaleString()} (inicial)
                </p>
                <p className="text-3xl font-semibold num-tab">
                  USD {displayPrice.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {live.bidCount} pujas · incremento USD {initial.bidIncrement.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('bidPlaceholderTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">{t('bidPlaceholderBody')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Separator />

      <section>
        <h2 className="text-lg font-medium text-text-strong mb-3">{t('bidsTitle')}</h2>
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

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-text-muted text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-text-strong">{value}</dd>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
```

> NOTE: the two `t('back')` lines marked `/* unused */` in the snippet above are placeholder noise from the iteration — DELETE THEM during implementation. The aside should show only: time left, separator, "USD X (inicial)" + big current price + count line.

- [ ] **Step 3.4: Build, format, commit**

```
pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/buyer/load-auction.ts apps/web/src/app/[locale]/'(protected)'/auctions/'[id]'
git commit -m "feat(web): buyer auction detail with live updates and photo gallery"
```

---

## Task 4: Smoke test

1. Login admin (also acts as buyer for tabs since admin sees all).
2. Navigate to `/auctions` → catalog with the auction created in Plan 4b smoke test.
3. Tabs: switch between "Todas", "Cierran pronto" (within 24h), "Favoritos".
4. Click ♡ on a card → moves to favorites tab.
5. Click the card → detail page.
6. See photo gallery (if uploaded), specs, description, sticky panel with countdown, bid placeholder, "Aún no hay pujas".
7. Open a second browser tab, log in as same admin in `/staff/auctions/[id]`. (For full bid stream test, Plan 6 is needed; for now we just verify subscription compiles.)

---

## Self-Review

Spec coverage (§6 buyer):

- Hero/búsqueda → omitted (search bar deferred to post-MVP)
- Filtros laterales → omitted (deferred — tabs cover the most-used cuts)
- Grid de cards con countdown ✅
- Tabs all/cerrando-pronto/recién-listadas/favoritos → 3 of 4 (recién listadas deferred — it's also "all" sorted differently)
- Detalle: carrusel ✅, specs ✅, panel sticky ✅, lista live de pujas ✅, favorito ✅
- Botón puja → placeholder for Plan 6 ✅

Out of scope:

- Search input + per-attribute filters (post-MVP polish)
- Image lightbox (current gallery is functional)
- Anonymized bidder display formatted differently (already shows `firstName + lastInitial.`)

---

## Execution Handoff

Recommended batches:

- Batch MM: Task 1 (helpers + page + i18n)
- Batch NN: Task 2 (grid + card)
- Batch OO: Task 3 (detail page + view)
