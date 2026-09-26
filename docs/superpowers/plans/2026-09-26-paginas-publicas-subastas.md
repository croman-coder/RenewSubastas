# Páginas públicas de subastas (Tanda 2A) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada subasta minorista tenga una página pública en `/{locale}/auctions/{id}` —el mismo link para todos— que se pueda compartir con vista previa del auto e indexar mientras está abierta.

**Architecture:** La ficha sale del grupo `(protected)` a un grupo nuevo `(abierto)`, cuyo layout usa `AppShell` con sesión y la barra pública sin ella. La rama con sesión queda igual que hoy. La rama sin sesión lee un subconjunto cerrado de datos con el Admin SDK (en caché 30 s), decide el estado con una regla pura (programada, en vivo, vendida visible, redirigir o finalizada) y dibuja una vista pública con tarjeta "Creá tu cuenta para pujar", compartir y otras subastas. SEO: metadata y datos estructurados por subasta, imagen para redes propia y sitemap con las subastas abiertas.

**Tech Stack:** Next.js 14 App Router, next-intl, Firebase Admin SDK (Firestore), `next/og`, vitest (entorno `node`, sin jsdom).

**Spec:** `docs/superpowers/specs/2026-09-26-paginas-publicas-subastas-design.md`

## Global Constraints

- **Solo subastas minoristas son públicas.** `audience` distinto de `retail` → 404 sin sesión. Un `audience` ausente cuenta como `retail` (misma regla que `firestore.rules`).
- **La versión pública nunca lleva:** VIN, chapa, pujas (con o sin nombre), visitantes, reserva, pago ni ganador.
- **Un solo link:** `/{locale}/auctions/{id}`. Con sesión, la ficha de hoy sin cambios de comportamiento.
- **No se tocan `firestore.rules`, `storage.rules` ni `firestore.indexes.json`.** Todo lo público se lee en el servidor.
- Datos públicos en `unstable_cache` 30 s. La redirección a una subasta nueva del mismo vehículo es **temporal** (`redirect()` de Next, 307).
- `robots: noindex` en todo estado que la spec (§6) marca no indexable. `/en` sigue sin indexar por el layout (`indexRobots`).
- Montos con `formatAmount`/`formatNumber` (`lib/format/money.ts`), fechas con `formatDateTimePy` (`lib/format/date.ts`). Nunca `toLocaleString()` sin idioma.
- Diseño "tinta y papel" (`DESIGN.md`): tokens de `globals.css`, sin desenfoques ni brillos.
- `apps/web` no tiene harness de render (vitest `environment: 'node'`): se testean módulos puros. Los módulos `server-only` no se importan desde tests (resuelven al build que lanza error).
- Comentarios nuevos en español, con el porqué y la fecha si nacen de un incidente o una decisión.
- **Local primero:** commits locales, sin `git push`. El deploy lo decide Croman (cada push a `main` cuesta 15 créditos de Netlify).
- Commits convencionales en español, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo                                                                 | Responsabilidad                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/lib/buyer/public-auction.ts` (+test)                      | Tipo `PublicAuctionDetail`, mapeo puro desde los documentos, `auctionPath` |
| `apps/web/src/lib/buyer/load-public-auction.ts`                         | Lectura con Admin SDK + caché 30 s (`server-only`)                         |
| `apps/web/src/lib/auctions/public-state.ts` (+test)                     | Regla pura del ciclo de vida (spec §6)                                     |
| `apps/web/src/lib/buyer/relisted.ts` (+test)                            | Elige la subasta abierta más nueva del mismo vehículo                      |
| `apps/web/src/lib/buyer/find-relisted-auction.ts`                       | Consulta por `vehicleId` (`server-only`)                                   |
| `apps/web/src/lib/seo/auction-seo.ts` (+test)                           | Metadata y datos estructurados de una subasta                              |
| `apps/web/src/lib/seo/og-photo.ts` (+test)                              | Foto para la imagen de redes, embebida como data URI                       |
| `apps/web/src/lib/seo/sitemap-entries.ts` (+test)                       | Entradas del sitemap, puras                                                |
| `apps/web/src/lib/share/whatsapp.ts` (+test)                            | Texto y link de compartir                                                  |
| `apps/web/src/components/auctions/detail-parts.tsx`                     | Galería, `SpecTile`, `StatusChip`, `CountdownCard` compartidos             |
| `apps/web/src/components/auctions/financing-calculator.tsx`             | Movido desde la ruta; lo usan las dos vistas                               |
| `apps/web/src/app/[locale]/(abierto)/layout.tsx`                        | Elige el marco según la sesión                                             |
| `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx`            | Rama con sesión (hoy) y rama pública                                       |
| `apps/web/src/app/[locale]/(abierto)/auctions/[id]/opengraph-image.tsx` | Imagen para redes por subasta                                              |
| `apps/web/src/components/public/public-auction-view.tsx`                | Ficha pública (cliente)                                                    |
| `apps/web/src/components/public/public-auction-finished.tsx`            | "Subasta finalizada"                                                       |
| `apps/web/src/components/public/bid-cta.tsx`                            | "Creá tu cuenta para pujar"                                                |
| `apps/web/src/components/public/share-auction.tsx`                      | Botones de compartir (cliente)                                             |
| `apps/web/src/components/public/other-live-auctions.tsx`                | Otras subastas en vivo                                                     |
| `functions/scripts/verify-public-auctions.ts`                           | Verificación de punta a punta contra emuladores                            |

---

### Task 1: Datos públicos de una subasta

**Files:**

- Create: `apps/web/src/lib/buyer/public-auction.ts`
- Create: `apps/web/src/lib/buyer/load-public-auction.ts`
- Test: `apps/web/src/lib/buyer/public-auction.test.ts`

**Interfaces:**

- Produces: `interface PublicAuctionDetail` (claves exactas en `PUBLIC_AUCTION_KEYS`), `toPublicAuctionDetail(id: string, auction: Record<string, unknown>, vehicle: Record<string, unknown>): PublicAuctionDetail | null`, `auctionPath(locale: string, id: string): \`/${string}\``, `loadPublicAuction(id: string): Promise<PublicAuctionDetail | null>`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/buyer/public-auction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auctionPath, PUBLIC_AUCTION_KEYS, toPublicAuctionDetail } from './public-auction';

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });

const auction = {
  vehicleId: 'veh-1',
  audience: 'retail',
  startingPrice: 10000,
  currentBid: 12500,
  bidCount: 3,
  bidIncrement: 500,
  buyNowPrice: 18000,
  status: 'live',
  outcome: null,
  startsAt: ts('2026-10-01T12:00:00Z'),
  endsAt: ts('2026-10-03T21:00:00Z'),
  // Private: must never reach the public shape.
  reservePrice: 23456,
  winnerUid: 'uid-winner-secret',
  currentBidderUid: 'uid-bidder-secret',
  paymentStatus: 'pending_payment',
};

const vehicle = {
  make: 'Toyota',
  model: 'Hilux',
  year: 2019,
  vin: '8AJHA3CD1K1234567',
  licensePlate: 'AAAA123',
  mileage: 85000,
  transmission: 'automatic',
  fuelType: 'diesel',
  color: 'Blanco',
  condition: 'used',
  description: { es: 'Única dueña.', en: 'One owner.' },
  images: [
    { url: 'https://img.test/o/a.jpg', thumbnailUrl: 'https://img.test/o/thumbs/a.webp' },
    { url: 'https://img.test/o/b.jpg' },
  ],
};

describe('toPublicAuctionDetail', () => {
  it('exposes exactly the publishable keys', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(Object.keys(d).sort()).toEqual([...PUBLIC_AUCTION_KEYS].sort());
  });

  it('never carries VIN, plate, reserve, bidders or payment state', () => {
    const json = JSON.stringify(toPublicAuctionDetail('auc-1', auction, vehicle));
    for (const secret of [
      '8AJHA3CD1K1234567',
      'AAAA123',
      '23456',
      'uid-winner-secret',
      'uid-bidder-secret',
      'pending_payment',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('returns null for a wholesale auction', () => {
    expect(
      toPublicAuctionDetail('auc-1', { ...auction, audience: 'wholesale' }, vehicle),
    ).toBeNull();
  });

  it('treats a missing audience as retail, like firestore.rules', () => {
    const legacy: Record<string, unknown> = { ...auction };
    delete legacy['audience'];
    expect(toPublicAuctionDetail('auc-1', legacy, vehicle)).not.toBeNull();
  });

  it('converts Timestamps to milliseconds and keeps prices and state', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(d.startsAtMs).toBe(Date.parse('2026-10-01T12:00:00Z'));
    expect(d.endsAtMs).toBe(Date.parse('2026-10-03T21:00:00Z'));
    expect(d.currentBid).toBe(12500);
    expect(d.buyNowPrice).toBe(18000);
    expect(d.status).toBe('live');
  });

  it('uses the original photo when a thumbnail is missing', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(d.images).toEqual([
      { url: 'https://img.test/o/a.jpg', thumbnailUrl: 'https://img.test/o/thumbs/a.webp' },
      { url: 'https://img.test/o/b.jpg', thumbnailUrl: 'https://img.test/o/b.jpg' },
    ]);
  });
});

describe('auctionPath', () => {
  it('builds the single public link of an auction', () => {
    expect(auctionPath('es', 'auc-1')).toBe('/es/auctions/auc-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/buyer/public-auction.test.ts`
Expected: FAIL — `Failed to load url ./public-auction`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/buyer/public-auction.ts`:

```ts
/**
 * What an anonymous visitor may see of an auction (spec 2026-09-26 §4).
 *
 * A closed list on purpose: the test compares the object's keys against
 * PUBLIC_AUCTION_KEYS, so adding a field means touching the test and
 * deciding, on the spot, whether it is publishable. VIN, license plate,
 * bids, viewers, reserve, payment and winner never belong here.
 */
export type PublicAuctionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type PublicAuctionOutcome = 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline' | null;

export interface PublicAuctionDetail {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
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
  buyNowPrice: number | null;
  status: PublicAuctionStatus;
  outcome: PublicAuctionOutcome;
  startsAtMs: number;
  endsAtMs: number;
}

export const PUBLIC_AUCTION_KEYS = [
  'id',
  'vehicleId',
  'make',
  'model',
  'year',
  'mileage',
  'transmission',
  'fuelType',
  'color',
  'condition',
  'descriptionEs',
  'descriptionEn',
  'images',
  'startingPrice',
  'currentBid',
  'bidCount',
  'bidIncrement',
  'buyNowPrice',
  'status',
  'outcome',
  'startsAtMs',
  'endsAtMs',
] as const satisfies readonly (keyof PublicAuctionDetail)[];

type Doc = Record<string, unknown>;

function millis(d: Doc, key: string): number {
  return (d[key] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
}

/** Null for wholesale auctions: that segment is closed and never public. */
export function toPublicAuctionDetail(id: string, a: Doc, v: Doc): PublicAuctionDetail | null {
  const audience = (a['audience'] as string | undefined) ?? 'retail';
  if (audience !== 'retail') return null;
  const description = (v['description'] ?? {}) as { es?: string; en?: string };
  const images = (v['images'] as Array<{ url?: string; thumbnailUrl?: string }> | undefined) ?? [];
  return {
    id,
    vehicleId: (a['vehicleId'] as string | undefined) ?? '',
    make: (v['make'] as string | undefined) ?? '',
    model: (v['model'] as string | undefined) ?? '',
    year: (v['year'] as number | undefined) ?? 0,
    mileage: (v['mileage'] as number | undefined) ?? null,
    transmission:
      (v['transmission'] as PublicAuctionDetail['transmission'] | undefined) ?? 'manual',
    fuelType: (v['fuelType'] as PublicAuctionDetail['fuelType'] | undefined) ?? 'gasoline',
    color: (v['color'] as string | undefined) ?? null,
    condition: (v['condition'] as PublicAuctionDetail['condition'] | undefined) ?? 'used',
    descriptionEs: description.es ?? '',
    descriptionEn: description.en ?? null,
    images: images
      .filter((img): img is { url: string; thumbnailUrl?: string } => Boolean(img.url))
      .map((img) => ({ url: img.url, thumbnailUrl: img.thumbnailUrl ?? img.url })),
    startingPrice: (a['startingPrice'] as number | undefined) ?? 0,
    currentBid: (a['currentBid'] as number | undefined) ?? 0,
    bidCount: (a['bidCount'] as number | undefined) ?? 0,
    bidIncrement: (a['bidIncrement'] as number | undefined) ?? 500,
    buyNowPrice: (a['buyNowPrice'] as number | undefined) ?? null,
    status: (a['status'] as PublicAuctionStatus | undefined) ?? 'scheduled',
    outcome: (a['outcome'] as PublicAuctionOutcome | undefined) ?? null,
    startsAtMs: millis(a, 'startsAt'),
    endsAtMs: millis(a, 'endsAt'),
  };
}

/** The one link of an auction, for everyone (spec §2). */
export function auctionPath(locale: string, id: string): `/${string}` {
  return `/${locale}/auctions/${id}`;
}
```

`apps/web/src/lib/buyer/load-public-auction.ts`:

```ts
import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase/admin';
import { toPublicAuctionDetail, type PublicAuctionDetail } from './public-auction';

/**
 * Public data of one auction, cached 30 s per id (spec §4).
 *
 * Read with the Admin SDK: firestore.rules stay as they are, and a browser
 * without a session still cannot read `auctions` or `vehicles`. The cache
 * keeps a shared WhatsApp link from turning into two Firestore reads per
 * visit; anonymous visitors cannot bid, so 30 s of staleness is harmless.
 */
export function loadPublicAuction(id: string): Promise<PublicAuctionDetail | null> {
  return unstable_cache(
    async () => {
      const db = getFirestore(getAdminApp());
      const aSnap = await db.doc(`auctions/${id}`).get();
      if (!aSnap.exists) return null;
      const a = aSnap.data() ?? {};
      const vehicleId = a['vehicleId'] as string | undefined;
      const v = vehicleId ? ((await db.doc(`vehicles/${vehicleId}`).get()).data() ?? {}) : {};
      return toPublicAuctionDetail(id, a, v);
    },
    ['public-auction', id],
    { revalidate: 30 },
  )();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/buyer/public-auction.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/buyer/public-auction.ts apps/web/src/lib/buyer/public-auction.test.ts apps/web/src/lib/buyer/load-public-auction.ts
git commit -m "feat(subasta-publica): datos públicos con lista cerrada de campos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ciclo de vida y subasta nueva del mismo vehículo

**Files:**

- Create: `apps/web/src/lib/auctions/public-state.ts`
- Create: `apps/web/src/lib/buyer/relisted.ts`
- Create: `apps/web/src/lib/buyer/find-relisted-auction.ts`
- Test: `apps/web/src/lib/auctions/public-state.test.ts`
- Test: `apps/web/src/lib/buyer/relisted.test.ts`

**Interfaces:**

- Consumes: `isSoldOutcome(outcome: string | null): boolean` (`lib/auctions/sold-outcome.ts`), `isVisibleInCatalog(item: { status: string; outcome: string | null; endsAtMs: number }, nowMs: number): boolean` (`lib/buyer/catalog-visibility.ts`).
- Produces: `type FinishedResult = 'sold' | 'unsold' | 'cancelled' | 'pending'`, `type PublicAuctionState`, `needsRelistLookup(a: { status; outcome; endsAtMs }): boolean`, `publicAuctionState(a, relistedId: string | null, nowMs: number): PublicAuctionState`, `pickRelistedAuction(candidates: RelistCandidate[], currentId: string): string | null`, `findRelistedAuction(vehicleId: string, currentId: string): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/auctions/public-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { needsRelistLookup, publicAuctionState } from './public-state';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const FUTURE = NOW + 3_600_000;
const PAST = NOW - 3_600_000;

describe('publicAuctionState (spec §6)', () => {
  it('a scheduled auction is indexable', () => {
    expect(
      publicAuctionState({ status: 'scheduled', outcome: null, endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'scheduled',
      indexable: true,
    });
  });

  it('a live auction is indexable while its clock runs', () => {
    expect(
      publicAuctionState({ status: 'live', outcome: null, endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'live',
      indexable: true,
    });
  });

  it('a live auction past its close, before the tick flips it, is finished with the result pending', () => {
    expect(
      publicAuctionState({ status: 'live', outcome: null, endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'pending',
      indexable: false,
    });
  });

  it('a sale while its lote is still open shows the SOLD band, not indexable', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold', endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'sold-visible',
      indexable: false,
    });
  });

  it('a showroom sale counts as sold too', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold_offline', endsAtMs: FUTURE }, null, NOW)
        .kind,
    ).toBe('sold-visible');
  });

  it('a sale whose lote closed is finished as sold', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold', endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'sold',
      indexable: false,
    });
  });

  it('an unsold auction whose vehicle is back on auction redirects there', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'no_bids', endsAtMs: PAST }, 'auc-2', NOW),
    ).toEqual({
      kind: 'redirect',
      toAuctionId: 'auc-2',
      indexable: false,
    });
  });

  it('an unsold auction without a new one is finished as unsold', () => {
    expect(
      publicAuctionState(
        { status: 'ended', outcome: 'reserve_not_met', endsAtMs: PAST },
        null,
        NOW,
      ),
    ).toEqual({ kind: 'finished', result: 'unsold', indexable: false });
  });

  it('a cancelled auction redirects if relisted, otherwise says it was cancelled', () => {
    expect(
      publicAuctionState({ status: 'cancelled', outcome: null, endsAtMs: PAST }, 'auc-3', NOW).kind,
    ).toBe('redirect');
    expect(
      publicAuctionState({ status: 'cancelled', outcome: null, endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'cancelled',
      indexable: false,
    });
  });
});

describe('needsRelistLookup', () => {
  it('only asks for unsold or cancelled auctions', () => {
    expect(needsRelistLookup({ status: 'ended', outcome: 'no_bids', endsAtMs: PAST })).toBe(true);
    expect(needsRelistLookup({ status: 'cancelled', outcome: null, endsAtMs: PAST })).toBe(true);
    expect(needsRelistLookup({ status: 'ended', outcome: 'sold', endsAtMs: PAST })).toBe(false);
    expect(needsRelistLookup({ status: 'live', outcome: null, endsAtMs: FUTURE })).toBe(false);
    expect(needsRelistLookup({ status: 'scheduled', outcome: null, endsAtMs: FUTURE })).toBe(false);
  });
});
```

`apps/web/src/lib/buyer/relisted.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickRelistedAuction } from './relisted';

describe('pickRelistedAuction', () => {
  it('ignores the current auction and closed ones', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-1', status: 'ended', audience: 'retail', endsAtMs: 1 },
          { id: 'auc-0', status: 'ended', audience: 'retail', endsAtMs: 2 },
        ],
        'auc-1',
      ),
    ).toBeNull();
  });

  it('never points a public page at a wholesale auction', () => {
    expect(
      pickRelistedAuction(
        [{ id: 'auc-2', status: 'live', audience: 'wholesale', endsAtMs: 5 }],
        'auc-1',
      ),
    ).toBeNull();
  });

  it('prefers a live auction over a scheduled one', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-sched', status: 'scheduled', audience: 'retail', endsAtMs: 10 },
          { id: 'auc-live', status: 'live', endsAtMs: 20 },
        ],
        'auc-1',
      ),
    ).toBe('auc-live');
  });

  it('among two open ones of the same status, picks the one closing first', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-late', status: 'scheduled', audience: 'retail', endsAtMs: 30 },
          { id: 'auc-soon', status: 'scheduled', audience: 'retail', endsAtMs: 10 },
        ],
        'auc-1',
      ),
    ).toBe('auc-soon');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/lib/auctions/public-state.test.ts src/lib/buyer/relisted.test.ts`
Expected: FAIL — `Failed to load url ./public-state` and `./relisted`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/auctions/public-state.ts`:

```ts
import { isSoldOutcome } from './sold-outcome';
import { isVisibleInCatalog } from '@/lib/buyer/catalog-visibility';

/**
 * What the public page of an auction shows, and whether search engines may
 * index it (spec 2026-09-26 §6, "según el resultado", chosen by Croman).
 * Pure so every row of that table is a test.
 */
export type FinishedResult = 'sold' | 'unsold' | 'cancelled' | 'pending';

export type PublicAuctionState =
  | { kind: 'scheduled'; indexable: true }
  | { kind: 'live'; indexable: true }
  | { kind: 'sold-visible'; indexable: false }
  | { kind: 'redirect'; toAuctionId: string; indexable: false }
  | { kind: 'finished'; result: FinishedResult; indexable: false };

interface StateInput {
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  outcome: string | null;
  endsAtMs: number;
}

/** Only unsold or cancelled auctions need to know about a newer one. */
export function needsRelistLookup(a: StateInput): boolean {
  if (a.status === 'cancelled') return true;
  return a.status === 'ended' && !isSoldOutcome(a.outcome);
}

export function publicAuctionState(
  a: StateInput,
  relistedId: string | null,
  nowMs: number,
): PublicAuctionState {
  if (a.status === 'scheduled') return { kind: 'scheduled', indexable: true };
  if (a.status === 'live') {
    // The tick that closes auctions runs about once a minute: past the close
    // but still `live` means the result is not known yet.
    return a.endsAtMs > nowMs
      ? { kind: 'live', indexable: true }
      : { kind: 'finished', result: 'pending', indexable: false };
  }
  if (a.status === 'ended' && isSoldOutcome(a.outcome)) {
    return isVisibleInCatalog(a, nowMs)
      ? { kind: 'sold-visible', indexable: false }
      : { kind: 'finished', result: 'sold', indexable: false };
  }
  if (relistedId) return { kind: 'redirect', toAuctionId: relistedId, indexable: false };
  return {
    kind: 'finished',
    result: a.status === 'cancelled' ? 'cancelled' : 'unsold',
    indexable: false,
  };
}
```

`apps/web/src/lib/buyer/relisted.ts`:

```ts
export interface RelistCandidate {
  id: string;
  status: string;
  audience?: string;
  endsAtMs: number;
}

/**
 * The open retail auction of the same vehicle that an old, unsold link
 * should lead to (spec §6). Live beats scheduled; between equals, the one
 * that closes first. Wholesale is never a target: the link is public.
 */
export function pickRelistedAuction(
  candidates: RelistCandidate[],
  currentId: string,
): string | null {
  const open = candidates.filter(
    (c) =>
      c.id !== currentId &&
      (c.audience ?? 'retail') === 'retail' &&
      (c.status === 'live' || c.status === 'scheduled'),
  );
  open.sort((x, y) =>
    x.status === y.status ? x.endsAtMs - y.endsAtMs : x.status === 'live' ? -1 : 1,
  );
  return open[0]?.id ?? null;
}
```

`apps/web/src/lib/buyer/find-relisted-auction.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase/admin';
import { pickRelistedAuction } from './relisted';

/**
 * Same `where('vehicleId', '==', …)` the app already runs elsewhere
 * (insights, dailyUnsoldDigest): single-field index, no new composite
 * index. A vehicle has a handful of auctions, so filtering in memory is fine.
 * React's cache() dedupes the call between generateMetadata and the page.
 */
export const findRelistedAuction = cache(
  async (vehicleId: string, currentId: string): Promise<string | null> => {
    if (!vehicleId) return null;
    const snap = await getFirestore(getAdminApp())
      .collection('auctions')
      .where('vehicleId', '==', vehicleId)
      .get();
    return pickRelistedAuction(
      snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          status: (x['status'] as string | undefined) ?? '',
          audience: x['audience'] as string | undefined,
          endsAtMs: (x['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        };
      }),
      currentId,
    );
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/lib/auctions/public-state.test.ts src/lib/buyer/relisted.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auctions/public-state.ts apps/web/src/lib/auctions/public-state.test.ts apps/web/src/lib/buyer/relisted.ts apps/web/src/lib/buyer/relisted.test.ts apps/web/src/lib/buyer/find-relisted-auction.ts
git commit -m "feat(subasta-publica): regla del ciclo de vida y subasta nueva del mismo vehículo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: SEO de la ficha (metadata y datos estructurados)

**Files:**

- Create: `apps/web/src/lib/seo/auction-seo.ts`
- Test: `apps/web/src/lib/seo/auction-seo.test.ts`

**Interfaces:**

- Consumes: `PublicAuctionDetail` (Task 1), `PublicAuctionState` (Task 2), `SITE_URL`, `INDEXED_LOCALES`, `DEFAULT_LOCALE` (`lib/seo/site.ts`), `formatAmount`, `formatNumber`, `formatDateTimePy`.
- Produces: `interface VehicleLabels { fuel: string; transmission: string }`, `auctionTitle(d): string`, `auctionDescription(d, labels, state): string`, `auctionMetadata(d, labels, state, locale): Metadata`, `vehicleJsonLd(d, labels, state, locale): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/seo/auction-seo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auctionDescription, auctionMetadata, auctionTitle, vehicleJsonLd } from './auction-seo';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';

const d: PublicAuctionDetail = {
  id: 'auc-1',
  vehicleId: 'veh-1',
  make: 'Toyota',
  model: 'Hilux',
  year: 2019,
  mileage: 85000,
  transmission: 'automatic',
  fuelType: 'diesel',
  color: 'Blanco',
  condition: 'used',
  descriptionEs: 'Única dueña.',
  descriptionEn: null,
  images: [{ url: 'https://img.test/a.jpg', thumbnailUrl: 'https://img.test/a.webp' }],
  startingPrice: 10000,
  currentBid: 18500,
  bidCount: 4,
  bidIncrement: 500,
  buyNowPrice: null,
  status: 'live',
  outcome: null,
  startsAtMs: Date.parse('2026-10-01T12:00:00Z'),
  // 18:00 in Asunción (UTC-3).
  endsAtMs: Date.parse('2026-10-03T21:00:00Z'),
};
const labels = { fuel: 'Diésel', transmission: 'Automática' };
const live = { kind: 'live', indexable: true } as const;

describe('auctionTitle', () => {
  it('names the car and the auction', () => {
    expect(auctionTitle(d)).toBe('Toyota Hilux 2019 en subasta · Renew Subastas');
  });
});

describe('auctionDescription', () => {
  it('summarises km, fuel, transmission, current bid and closing time', () => {
    expect(auctionDescription(d, labels, live)).toBe(
      'Toyota Hilux 2019, 85.000 km, diésel, automática. Puja actual USD 18.500. Cierra el 03/10/2026 18:00. Vehículo usado certificado por Santa Rosa.',
    );
  });

  it('uses the starting price and the opening time before it opens', () => {
    const scheduled = { ...d, currentBid: 0, status: 'scheduled' as const };
    expect(auctionDescription(scheduled, labels, { kind: 'scheduled', indexable: true })).toContain(
      'Precio de salida USD 10.000. Abre el 01/10/2026 09:00.',
    );
  });
});

describe('auctionMetadata', () => {
  it('is canonical on the single link and indexable while open', () => {
    const m = auctionMetadata(d, labels, live, 'es');
    expect(m.alternates?.canonical).toBe('https://renewsubastas.com.py/es/auctions/auc-1');
    expect(Object.keys(m.alternates?.languages ?? {})).toEqual(['es', 'x-default']);
    expect(m.robots).toBeUndefined();
  });

  it('keeps finished auctions out of the index', () => {
    const m = auctionMetadata(
      d,
      labels,
      { kind: 'finished', result: 'unsold', indexable: false },
      'es',
    );
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});

describe('vehicleJsonLd', () => {
  it('describes the car and its offer in USD until the close', () => {
    const j = vehicleJsonLd(d, labels, live, 'es');
    expect(j['@type']).toBe('Car');
    expect(j['brand']).toEqual({ '@type': 'Brand', name: 'Toyota' });
    expect(j['mileageFromOdometer']).toEqual({
      '@type': 'QuantitativeValue',
      value: 85000,
      unitCode: 'KMT',
    });
    expect(j['offers']).toMatchObject({
      '@type': 'Offer',
      price: 18500,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: '2026-10-03',
    });
  });

  it('marks a sale as sold out', () => {
    const j = vehicleJsonLd(d, labels, { kind: 'sold-visible', indexable: false }, 'es');
    expect((j['offers'] as Record<string, unknown>)['availability']).toBe(
      'https://schema.org/SoldOut',
    );
  });

  it('never publishes the VIN or the plate', () => {
    expect(JSON.stringify(vehicleJsonLd(d, labels, live, 'es'))).not.toMatch(/vin|licensePlate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/seo/auction-seo.test.ts`
Expected: FAIL — `Failed to load url ./auction-seo`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/seo/auction-seo.ts`:

```ts
import type { Metadata } from 'next';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { PublicAuctionState } from '@/lib/auctions/public-state';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { DEFAULT_LOCALE, INDEXED_LOCALES, SITE_URL } from './site';

/** Labels already translated by the caller (next-intl lives in the page). */
export interface VehicleLabels {
  fuel: string;
  transmission: string;
}

const url = (locale: string, id: string) => `${SITE_URL}/${locale}/auctions/${id}`;

export function auctionTitle(d: PublicAuctionDetail): string {
  return `${d.make} ${d.model} ${d.year} en subasta · Renew Subastas`;
}

export function auctionDescription(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
): string {
  const km = d.mileage !== null ? `, ${formatNumber(d.mileage)} km` : '';
  const price =
    d.currentBid > 0
      ? `Puja actual USD ${formatAmount(d.currentBid)}`
      : `Precio de salida USD ${formatAmount(d.startingPrice)}`;
  const when =
    state.kind === 'scheduled'
      ? ` Abre el ${formatDateTimePy('es', d.startsAtMs)}.`
      : state.kind === 'live'
        ? ` Cierra el ${formatDateTimePy('es', d.endsAtMs)}.`
        : ' Subasta finalizada.';
  return `${d.make} ${d.model} ${d.year}${km}, ${labels.fuel.toLowerCase()}, ${labels.transmission.toLowerCase()}. ${price}.${when} Vehículo usado certificado por Santa Rosa.`;
}

export function auctionMetadata(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
  locale: string,
): Metadata {
  const title = auctionTitle(d);
  const description = auctionDescription(d, labels, state);
  return {
    title,
    description,
    alternates: {
      canonical: url(locale, d.id),
      languages: Object.fromEntries([
        ...INDEXED_LOCALES.map((l) => [l, url(l, d.id)]),
        ['x-default', url(DEFAULT_LOCALE, d.id)],
      ]),
    },
    openGraph: {
      type: 'website',
      siteName: 'Renew Subastas',
      title,
      description,
      url: url(locale, d.id),
      locale: locale === 'en' ? 'en_US' : 'es_PY',
    },
    twitter: { card: 'summary_large_image', title, description },
    // Finished, sold or redirecting pages leave the index (spec §6).
    ...(state.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export function vehicleJsonLd(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
  locale: string,
): Record<string, unknown> {
  const sold =
    state.kind === 'sold-visible' || (state.kind === 'finished' && state.result === 'sold');
  const availability = sold
    ? 'https://schema.org/SoldOut'
    : state.kind === 'scheduled'
      ? 'https://schema.org/PreOrder'
      : 'https://schema.org/InStock';
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: `${d.make} ${d.model} ${d.year}`,
    brand: { '@type': 'Brand', name: d.make },
    model: d.model,
    vehicleModelDate: String(d.year),
    ...(d.mileage !== null
      ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: d.mileage, unitCode: 'KMT' } }
      : {}),
    fuelType: labels.fuel,
    vehicleTransmission: labels.transmission,
    ...(d.color ? { color: d.color } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    image: d.images.slice(0, 5).map((img) => img.url),
    url: url(locale, d.id),
    offers: {
      '@type': 'Offer',
      price: d.currentBid > 0 ? d.currentBid : d.startingPrice,
      priceCurrency: 'USD',
      availability,
      priceValidUntil: new Date(d.endsAtMs).toISOString().slice(0, 10),
      url: url(locale, d.id),
      seller: { '@type': 'Organization', name: 'Renew Subastas' },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/seo/auction-seo.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo/auction-seo.ts apps/web/src/lib/seo/auction-seo.test.ts
git commit -m "feat(seo): metadata y datos estructurados por subasta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Piezas compartidas de la ficha

Refactor sin cambio de comportamiento, salvo dos mejoras deliberadas: la foto grande usa la miniatura de 800 px (con link a la original) y todas las fotos llevan texto alternativo.

**Files:**

- Create: `apps/web/src/components/auctions/detail-parts.tsx`
- Move: `apps/web/src/app/[locale]/(protected)/auctions/[id]/financing-calculator.tsx` → `apps/web/src/components/auctions/financing-calculator.tsx`
- Modify: `apps/web/src/app/[locale]/(protected)/auctions/[id]/auction-detail-view.tsx` (usa las piezas; borra `Spec`, `StatusChip`, `CountdownCard`, `DigitGroup` locales y la galería inline)

**Interfaces:**

- Produces: `AuctionGallery({ images, alt })`, `SpecTile({ label, value })`, `StatusChip({ status, label })`, `CountdownCard({ label, remainingMs, urgent, critical, isLive })`, `FinancingCalculator` en `@/components/auctions/financing-calculator` (misma firma que hoy).

- [ ] **Step 1: Move the calculator**

```bash
git mv "apps/web/src/app/[locale]/(protected)/auctions/[id]/financing-calculator.tsx" apps/web/src/components/auctions/financing-calculator.tsx
```

- [ ] **Step 2: Create the shared parts**

`apps/web/src/components/auctions/detail-parts.tsx` — mismo markup y clases que las funciones locales de `auction-detail-view.tsx` de hoy:

```tsx
'use client';
import { useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Pieces of the auction detail shared by the signed-in view and the public
 * one (spec 2026-09-26 §5). Presentational only: whoever renders them owns
 * the clock and the data.
 */

export function AuctionGallery({
  images,
  alt,
}: {
  images: Array<{ url: string; thumbnailUrl: string }>;
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];
  return (
    <div className="space-y-2">
      <div className="group aspect-[4/3] bg-bg-deep rounded-2xl overflow-hidden ring-1 ring-text-subtle/10 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.5)]">
        {current ? (
          // The 800 px thumbnail is plenty for this box and weighs a tenth of
          // the original, which stays one click away for zooming in.
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${alt} — ver foto en tamaño completo`}
          >
            <img
              src={current.thumbnailUrl}
              alt={alt}
              width={800}
              height={600}
              className="w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </a>
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle">sin fotos</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {images.slice(0, 12).map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver foto ${i + 1}`}
              className={
                'aspect-square rounded-lg overflow-hidden ring-2 transition-all duration-200 ' +
                (i === active
                  ? 'ring-text-strong scale-[0.98]'
                  : 'ring-transparent opacity-60 hover:opacity-100 hover:ring-text-subtle/30')
              }
            >
              <img
                src={img.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hover-lift rounded-lg border border-text-subtle/10 bg-bg-elev px-3 py-2.5 hover:border-text-subtle/25 hover:bg-bg-elev/50">
      <dt className="text-text-muted text-[10px] uppercase tracking-[0.1em] font-semibold">
        {label}
      </dt>
      <dd className="text-text-strong text-sm mt-0.5 truncate">{value}</dd>
    </div>
  );
}

export function StatusChip({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    live: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
    scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
    ended: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
    cancelled: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  };
  const cls = map[status] ?? map['ended']!;
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ' +
        'text-[11px] uppercase tracking-[0.08em] font-semibold ' +
        'ring-1 ring-inset ' +
        cls
      }
    >
      {status === 'live' && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400/70 animate-ping" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
        </span>
      )}
      {label}
    </span>
  );
}

export function CountdownCard({
  label,
  remainingMs,
  urgent,
  critical,
  isLive,
}: {
  label: string;
  remainingMs: number;
  urgent: boolean;
  critical: boolean;
  isLive: boolean;
}) {
  const ended = remainingMs <= 0;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const tone = ended
    ? 'text-text-muted'
    : critical
      ? 'text-rose-600 dark:text-rose-400'
      : urgent
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-text-strong';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 shadow-card">
      <div className="relative space-y-2">
        <div className="flex items-center gap-1.5">
          <Clock
            className={'w-3.5 h-3.5 ' + tone + (critical ? ' animate-pulse' : '')}
            strokeWidth={2.5}
          />
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-text-muted">
            {label}
          </p>
        </div>
        {ended ? (
          <p className="text-2xl font-bold tracking-tight text-text-muted num-tab">Finalizada</p>
        ) : (
          <div className="flex items-end gap-3 flex-wrap">
            {days > 0 && <DigitGroup value={days} unit="d" tone={tone} small />}
            <DigitGroup value={h} unit="h" tone={tone} />
            <DigitGroup value={m} unit="m" tone={tone} />
            <DigitGroup value={s} unit="s" tone={tone} pulsing={isLive && critical} />
          </div>
        )}
      </div>
    </div>
  );
}

function DigitGroup({
  value,
  unit,
  tone,
  small,
  pulsing,
}: {
  value: number;
  unit: string;
  tone: string;
  small?: boolean;
  pulsing?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span
        // Server and browser read the clock a moment apart (same fix as
        // BatchCountdown): the mismatch is expected on this element only.
        suppressHydrationWarning
        className={
          'font-extrabold num-tab tracking-tight tabular-nums ' +
          (small ? 'text-3xl' : 'text-5xl sm:text-[3.5rem] sm:leading-[1]') +
          ' ' +
          tone +
          (pulsing ? ' animate-pulse' : '')
        }
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className={'text-xs font-semibold uppercase tracking-wider ' + tone + '/70'}>
        {unit}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Use the parts in the signed-in view**

En `auction-detail-view.tsx`:

1. Reemplazar `import { FinancingCalculator } from './financing-calculator';` por `import { FinancingCalculator } from '@/components/auctions/financing-calculator';`.
2. Agregar `import { AuctionGallery, CountdownCard, SpecTile, StatusChip } from '@/components/auctions/detail-parts';` y `import { vehicleAlt } from '@/lib/format/vehicle-alt';`.
3. Reemplazar todo el bloque `{/* Photo gallery */}` (el `<div className="space-y-2">…</div>` con la foto grande y los botones) por `<AuctionGallery images={initial.images} alt={vehicleAlt(initial.make, initial.model, initial.year)} />`, y borrar el estado `activeImg`.
4. Reemplazar cada `<Spec` por `<SpecTile`.
5. Borrar al final del archivo las funciones locales `Spec`, `StatusChip`, `CountdownCard` y `DigitGroup`, y el import de `Clock` si queda sin uso.

- [ ] **Step 4: Verify nothing else changed**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores; los 43+ archivos de test existentes pasan.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/components/auctions "apps/web/src/app/[locale]/(protected)/auctions/[id]"
git commit -m "refactor(ficha): galería, fichas y cuenta regresiva como piezas compartidas

La foto grande usa la miniatura de 800 px con link a la original, y las
fotos llevan texto alternativo. La calculadora pasa a components/auctions
porque la va a usar también la ficha pública.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mover la ficha a `(abierto)` con la rama con sesión intacta

Al terminar esta tarea, sin sesión se sigue yendo al login como hoy. La vista pública llega en la Task 6.

**Files:**

- Move: `apps/web/src/app/[locale]/(protected)/auctions/[id]/` → `apps/web/src/app/[locale]/(abierto)/auctions/[id]/`
- Create: `apps/web/src/app/[locale]/(abierto)/layout.tsx`
- Modify: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx`

**Interfaces:**

- Consumes: `getOptionalUser(): Promise<CurrentUser | null>` y `CurrentUser { uid; role; email; firstName; audience? }` (`lib/auth/server.ts`), `AppShell({ locale, children })`, `PublicTopbar({ locale })`, `LegalFooter({ locale, company })`, `loadCompany()`.
- Produces: layout `(abierto)` y la página con dos ramas.

- [ ] **Step 1: Move the route folder**

```bash
mkdir -p "apps/web/src/app/[locale]/(abierto)/auctions"
git mv "apps/web/src/app/[locale]/(protected)/auctions/[id]" "apps/web/src/app/[locale]/(abierto)/auctions/[id]"
```

- [ ] **Step 2: Create the layout**

`apps/web/src/app/[locale]/(abierto)/layout.tsx`:

```tsx
import { AppShell } from '@/components/shell/app-shell';
import { PublicTopbar } from '@/components/public/public-topbar';
import { LegalFooter } from '@/components/legal/legal-footer';
import { getOptionalUser } from '@/lib/auth/server';
import { loadCompany } from '@/lib/legal/load-company';

/**
 * Pages that anyone may open (spec 2026-09-26 §3). With a session, the same
 * AppShell as (protected) — which calls getCurrentUser, so disabled accounts
 * and the staff MFA gate behave exactly as before. Without one, the public
 * chrome of the landing.
 */
export default async function OpenLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getOptionalUser();
  if (user) return <AppShell locale={locale}>{children}</AppShell>;
  const company = await loadCompany();
  return (
    <div className="min-h-dvh flex flex-col bg-bg-base">
      <PublicTopbar locale={locale} />
      <main id="contenido" className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-8 py-6 md:py-8">
        {children}
      </main>
      <LegalFooter locale={locale} company={company} />
    </div>
  );
}
```

- [ ] **Step 3: Split the page into the two branches**

`apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx` completo:

```tsx
import { notFound, redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/server';
import { loadAuction } from '@/lib/buyer/load-auction';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { auctionPath } from '@/lib/buyer/public-auction';
import { AuctionDetailView } from './auction-detail-view';
import { ViewTracker } from '@/components/insights/view-tracker';

interface Props {
  params: { locale: string; id: string };
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const user = await getOptionalUser();
  if (!user) {
    // Same as before this route left (protected); Task 6 replaces it with
    // the public view.
    redirect(`/${locale}/login?from=${encodeURIComponent(auctionPath(locale, id))}`);
  }

  const [auction, config] = await Promise.all([loadAuction(id), loadAppConfigSnapshot()]);
  if (!auction) notFound();
  // loadAuction reads via the Admin SDK, which bypasses firestore.rules —
  // mirror the audience gate the rules enforce so a retail buyer can't
  // reach a wholesale auction (pricing, VIN, license plate) by its id.
  // Staff/admin/finanzas see everything, same as the rules.
  if (user.role === 'buyer' && auction.audience !== (user.audience ?? 'retail')) notFound();

  return (
    <>
      <ViewTracker auctionId={id} />
      <AuctionDetailView
        locale={locale}
        initial={auction}
        myUid={user.uid}
        allowManualIncrement={config.bid.allowManualIncrement}
        financingConfig={config.financing}
        currencyConfig={config.currency}
      />
    </>
  );
}
```

- [ ] **Step 4: Build and confirm Next accepts both route groups**

Run: `pnpm --filter @carbid/web typecheck && cd apps/web && npx next build 2>&1 | grep -E "auctions|error|Error"`
Expected: la tabla de rutas muestra `ƒ /[locale]/auctions` y `ƒ /[locale]/auctions/[id]`, sin "conflicting routes" ni errores.

- [ ] **Step 5: Commit**

```bash
git add -A "apps/web/src/app/[locale]/(abierto)" "apps/web/src/app/[locale]/(protected)/auctions"
git commit -m "refactor(ficha): la ficha pasa al grupo (abierto) sin cambiar la rama con sesión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: La ficha pública

**Files:**

- Create: `apps/web/src/lib/share/whatsapp.ts`
- Test: `apps/web/src/lib/share/whatsapp.test.ts`
- Create: `apps/web/src/components/public/bid-cta.tsx`
- Create: `apps/web/src/components/public/share-auction.tsx`
- Create: `apps/web/src/components/public/public-auction-view.tsx`
- Create: `apps/web/src/components/public/public-auction-finished.tsx`
- Create: `apps/web/src/components/public/other-live-auctions.tsx`
- Modify: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx`
- Modify: `apps/web/src/lib/insights/traffic-summary.ts` (comentarios) y `apps/web/src/app/[locale]/(protected)/staff/insights/_components/traffic-panel.tsx` (textos)

**Interfaces:**

- Consumes: Tasks 1–4; `listLandingAuctions(): Promise<PublicAuction[]>` (`lib/buyer/landing-auctions.ts`); `PublicAuctionCard({ locale, auction, index })`; `SoldBanner({ variant: 'detail' })`; `trackViewContent({ auctionId, make, model, year, value })`; `vehicleEnumLabelKey(field, value)` (claves bajo `staff.vehicles.form`).
- Produces: `shareText(title): string`, `whatsappShareUrl(text, url): string`; componentes `BidCta`, `ShareAuction`, `PublicAuctionView`, `PublicAuctionFinished`, `OtherLiveAuctions`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/share/whatsapp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shareText, whatsappShareUrl } from './whatsapp';

describe('share texts', () => {
  it('invites to look at the car', () => {
    expect(shareText('Toyota Hilux 2019')).toBe('Mirá este Toyota Hilux 2019 en subasta');
  });

  it('builds a wa.me link with the text and the link, encoded', () => {
    expect(
      whatsappShareUrl(
        'Mirá este Toyota Hilux 2019 en subasta',
        'https://renewsubastas.com.py/es/auctions/auc-1',
      ),
    ).toBe(
      'https://wa.me/?text=Mir%C3%A1%20este%20Toyota%20Hilux%202019%20en%20subasta%3A%20https%3A%2F%2Frenewsubastas.com.py%2Fes%2Fauctions%2Fauc-1',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/share/whatsapp.test.ts`
Expected: FAIL — `Failed to load url ./whatsapp`.

- [ ] **Step 3: Write the helper**

`apps/web/src/lib/share/whatsapp.ts`:

```ts
/** "Mirá este Toyota Hilux 2019 en subasta" — the message a shared link carries. */
export function shareText(title: string): string {
  return `Mirá este ${title} en subasta`;
}

/**
 * wa.me with the text and the link together: WhatsApp unfurls the link
 * with the auction's own preview image (opengraph-image of the page).
 */
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`;
}
```

Run: `cd apps/web && npx vitest run src/lib/share/whatsapp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Create the components**

`apps/web/src/components/public/bid-cta.tsx`:

```tsx
import Link from 'next/link';
import { auctionPath } from '@/lib/buyer/public-auction';

/**
 * Takes the place of the bid panel for visitors without an account. Both
 * links carry `from`, so after signing up or in they land back on this
 * auction (the register and login pages already honour it).
 */
export function BidCta({
  locale,
  auctionId,
  scheduled,
}: {
  locale: string;
  auctionId: string;
  scheduled: boolean;
}) {
  const from = encodeURIComponent(auctionPath(locale, auctionId));
  return (
    <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-3 shadow-card">
      <p className="text-base font-semibold text-text-strong">
        {scheduled ? 'Creá tu cuenta para pujar cuando abra' : 'Creá tu cuenta para pujar'}
      </p>
      <p className="text-sm text-text-muted text-pretty">
        Es gratis. Al terminar volvés a esta subasta.
      </p>
      <div className="grid gap-2">
        <Link
          href={`/${locale}/register?from=${from}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg bg-text-strong text-bg-base text-sm font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev"
        >
          Crear cuenta
        </Link>
        <Link
          href={`/${locale}/login?from=${from}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg border border-text-subtle/25 text-text-strong text-sm font-medium transition-colors hover:bg-bg-deep/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ya tengo cuenta
        </Link>
      </div>
    </div>
  );
}
```

`apps/web/src/components/public/share-auction.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Link2, Share2 } from 'lucide-react';
import { shareText, whatsappShareUrl } from '@/lib/share/whatsapp';

/**
 * On phones, the system share sheet (WhatsApp is one tap away); elsewhere,
 * wa.me in a new tab. Copying the link covers everything else.
 */
export function ShareAuction({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(title);

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      // A dismissed sheet rejects; there is nothing to recover from.
      await navigator.share({ title: text, url }).catch(() => undefined);
      return;
    }
    window.open(whatsappShareUrl(text, url), '_blank', 'noopener,noreferrer');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (permissions, insecure context): the share button still works.
    }
  }

  const btn =
    'h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border border-text-subtle/25 text-sm font-medium text-text-strong transition-colors hover:bg-bg-deep/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40';
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={share} className={btn}>
        <Share2 className="w-4 h-4" aria-hidden="true" /> Compartir
      </button>
      <button type="button" onClick={copy} className={btn}>
        <Link2 className="w-4 h-4" aria-hidden="true" /> {copied ? 'Link copiado' : 'Copiar link'}
      </button>
    </div>
  );
}
```

`apps/web/src/components/public/public-auction-view.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import {
  AuctionGallery,
  CountdownCard,
  SpecTile,
  StatusChip,
} from '@/components/auctions/detail-parts';
import { FinancingCalculator } from '@/components/auctions/financing-calculator';
import { SoldBanner } from '@/components/auctions/sold-banner';
import { BidCta } from './bid-cta';
import { ShareAuction } from './share-auction';
import { trackViewContent } from '@/lib/analytics/meta-events';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { vehicleAlt } from '@/lib/format/vehicle-alt';
import { vehicleEnumLabelKey, type VehicleEnumField } from '@/lib/format/vehicle-labels';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { AppConfigSnapshot } from '@/lib/admin/load-app-config';

interface Props {
  locale: string;
  detail: PublicAuctionDetail;
  kind: 'scheduled' | 'live' | 'sold-visible';
  shareUrl: string;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
}

/**
 * The auction page for visitors without an account (spec 2026-09-26 §5):
 * everything but bidding. No Firestore listeners — anonymous browsers can't
 * read auctions — so prices come from the server (cached 30 s) and only the
 * countdown ticks here.
 */
export function PublicAuctionView({
  locale,
  detail,
  kind,
  shareUrl,
  financingConfig,
  currencyConfig,
}: Props) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const tVehicle = useTranslations('staff.vehicles.form');
  const label = (field: VehicleEnumField, value: string) => {
    const key = vehicleEnumLabelKey(field, value);
    return key ? tVehicle(key) : value;
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Same Meta ViewContent as the signed-in page: one per view, not per render.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (viewed.current === detail.id) return;
    viewed.current = detail.id;
    trackViewContent({
      auctionId: detail.id,
      make: detail.make,
      model: detail.model,
      year: detail.year,
      value: detail.startingPrice,
    });
  }, [detail]);

  const title = vehicleAlt(detail.make, detail.model, detail.year);
  const isLive = kind === 'live';
  const remainingMs = (kind === 'scheduled' ? detail.startsAtMs : detail.endsAtMs) - now;
  const price = detail.currentBid > 0 ? detail.currentBid : detail.startingPrice;
  const description =
    locale === 'en' && detail.descriptionEn ? detail.descriptionEn : detail.descriptionEs;

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}` as `/${string}`}
        className="group inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Ver todas las subastas
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">
        <div className="space-y-6 min-w-0">
          <AuctionGallery images={detail.images} alt={title} />
          <header className="space-y-3">
            <StatusChip
              status={kind === 'sold-visible' ? 'ended' : kind}
              label={tStatus(kind === 'sold-visible' ? 'ended' : kind)}
            />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              {detail.make} {detail.model}{' '}
              <span className="num-tab text-text-muted font-light">{detail.year}</span>
            </h1>
          </header>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('specs')}
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <SpecTile
                label={t('transmission')}
                value={label('transmission', detail.transmission)}
              />
              <SpecTile label={t('fuelType')} value={label('fuelType', detail.fuelType)} />
              {detail.mileage !== null && (
                <SpecTile label={t('mileage')} value={`${formatNumber(detail.mileage)} km`} />
              )}
              <SpecTile label={t('condition')} value={label('condition', detail.condition)} />
              {detail.color && <SpecTile label={t('color')} value={detail.color} />}
            </dl>
          </section>
          {description && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
                {t('description')}
              </h2>
              <p className="whitespace-pre-line text-text-strong text-base leading-relaxed">
                {description}
              </p>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 self-start space-y-4">
          {kind === 'sold-visible' ? (
            <SoldBanner variant="detail" />
          ) : (
            <CountdownCard
              label={kind === 'scheduled' ? 'Abre en' : t('timeLeft')}
              remainingMs={remainingMs}
              urgent={isLive && remainingMs < 3_600_000}
              critical={isLive && remainingMs < 60_000}
              isLive={isLive}
            />
          )}
          <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-2 shadow-card">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              {detail.currentBid > 0 ? 'Puja actual' : t('startingPrice')}
            </p>
            <p className="flex items-baseline gap-2 whitespace-nowrap text-4xl sm:text-5xl font-extrabold tracking-tight num-tab text-text-strong">
              <span className="text-xl sm:text-2xl font-bold text-text-muted">USD</span>
              {formatAmount(price)}
            </p>
            <p className="text-xs text-text-muted num-tab">
              {detail.bidCount} {detail.bidCount === 1 ? 'puja' : 'pujas'} · incremento USD{' '}
              {formatAmount(detail.bidIncrement)}
            </p>
          </div>
          {kind !== 'sold-visible' && (
            <BidCta locale={locale} auctionId={detail.id} scheduled={kind === 'scheduled'} />
          )}
          <ShareAuction title={title} url={shareUrl} />
          {kind !== 'sold-visible' && (
            <FinancingCalculator
              priceUsd={price}
              config={financingConfig}
              currency={currencyConfig}
              locale={locale}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
```

`apps/web/src/components/public/public-auction-finished.tsx`:

```tsx
import Link from 'next/link';
import { vehicleAlt } from '@/lib/format/vehicle-alt';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { FinishedResult } from '@/lib/auctions/public-state';

const RESULT: Record<FinishedResult, string> = {
  sold: 'Este vehículo se vendió.',
  unsold: 'Esta subasta cerró sin venta.',
  cancelled: 'Esta subasta fue cancelada.',
  pending: 'La subasta acaba de cerrar; el resultado se confirma en unos minutos.',
};

/** Where an old link lands once the auction is over (spec §6). */
export function PublicAuctionFinished({
  locale,
  detail,
  result,
}: {
  locale: string;
  detail: PublicAuctionDetail;
  result: FinishedResult;
}) {
  const title = vehicleAlt(detail.make, detail.model, detail.year);
  const photo = detail.images[0]?.thumbnailUrl;
  return (
    <section className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 shadow-card grid gap-5 sm:grid-cols-[260px_1fr] items-center">
      {photo && (
        <img
          src={photo}
          alt={title}
          width={640}
          height={480}
          className="w-full aspect-[4/3] rounded-xl object-cover"
        />
      )}
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-text-muted">
          Subasta finalizada
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-text-strong">{title}</h1>
        <p className="text-text-muted">{RESULT[result]}</p>
        <Link
          href={`/${locale}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg bg-text-strong px-5 text-bg-base text-sm font-semibold transition-opacity hover:opacity-90"
        >
          Ver subastas en vivo
        </Link>
      </div>
    </section>
  );
}
```

`apps/web/src/components/public/other-live-auctions.tsx`:

```tsx
import { listLandingAuctions } from '@/lib/buyer/landing-auctions';
import { PublicAuctionCard } from './public-auction-card';

/** Up to four open auctions from the landing's cached list, without the current one. */
export async function OtherLiveAuctions({
  locale,
  excludeId,
}: {
  locale: string;
  excludeId: string;
}) {
  const items = (await listLandingAuctions())
    .filter((a) => a.id !== excludeId && (a.status === 'live' || a.status === 'scheduled'))
    .slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="space-y-4 pt-4">
      <h2 className="text-xl font-semibold tracking-tight text-text-strong">
        Otras subastas en vivo
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((a, i) => (
          // index offset keeps these below-the-fold cards lazy and animated.
          <PublicAuctionCard key={a.id} locale={locale} auction={a} index={i + 4} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire the public branch and the metadata into the page**

En `apps/web/src/app/[locale]/(abierto)/auctions/[id]/page.tsx`:

1. Cambiar el import existente de `auctionPath` por `import { auctionPath, type PublicAuctionDetail } from '@/lib/buyer/public-auction';` y agregar estos:

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { loadPublicAuction } from '@/lib/buyer/load-public-auction';
import { findRelistedAuction } from '@/lib/buyer/find-relisted-auction';
import { needsRelistLookup, publicAuctionState } from '@/lib/auctions/public-state';
import { auctionMetadata, vehicleJsonLd, type VehicleLabels } from '@/lib/seo/auction-seo';
import { vehicleEnumLabelKey, type VehicleEnumField } from '@/lib/format/vehicle-labels';
import { SITE_URL } from '@/lib/seo/site';
import { PublicAuctionView } from '@/components/public/public-auction-view';
import { PublicAuctionFinished } from '@/components/public/public-auction-finished';
import { OtherLiveAuctions } from '@/components/public/other-live-auctions';
```

2. Agregar arriba del componente:

```tsx
async function vehicleLabels(locale: string, d: PublicAuctionDetail): Promise<VehicleLabels> {
  const t = await getTranslations({ locale, namespace: 'staff.vehicles.form' });
  const label = (field: VehicleEnumField, value: string) => {
    const key = vehicleEnumLabelKey(field, value);
    return key ? t(key) : value;
  };
  return {
    fuel: label('fuelType', d.fuelType),
    transmission: label('transmission', d.transmission),
  };
}

async function resolveState(d: PublicAuctionDetail, id: string) {
  const relisted = needsRelistLookup(d) ? await findRelistedAuction(d.vehicleId, id) : null;
  return publicAuctionState(d, relisted, Date.now());
}

export async function generateMetadata({ params: { locale, id } }: Props): Promise<Metadata> {
  const detail = await loadPublicAuction(id);
  // Wholesale or unknown: nothing public to describe, and never indexable.
  if (!detail)
    return { title: 'Subasta · Renew Subastas', robots: { index: false, follow: false } };
  return auctionMetadata(
    detail,
    await vehicleLabels(locale, detail),
    await resolveState(detail, id),
    locale,
  );
}
```

3. Reemplazar el bloque `if (!user) { redirect(...) }` por:

```tsx
if (!user) {
  const detail = await loadPublicAuction(id);
  if (!detail) notFound();
  const state = await resolveState(detail, id);
  // Temporary on purpose: if the new auction also ends unsold, this link
  // must follow the same rule again (spec §6).
  if (state.kind === 'redirect') redirect(auctionPath(locale, state.toAuctionId));
  const [config, labels] = await Promise.all([
    loadAppConfigSnapshot(),
    vehicleLabels(locale, detail),
  ]);
  const jsonLd = JSON.stringify(vehicleJsonLd(detail, labels, state, locale)).replace(
    /</g,
    '\\u003c',
  );
  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {state.kind === 'finished' ? (
        <PublicAuctionFinished locale={locale} detail={detail} result={state.result} />
      ) : (
        <PublicAuctionView
          locale={locale}
          detail={detail}
          kind={state.kind}
          shareUrl={`${SITE_URL}${auctionPath(locale, id)}`}
          financingConfig={config.financing}
          currencyConfig={config.currency}
        />
      )}
      <OtherLiveAuctions locale={locale} excludeId={id} />
    </div>
  );
}
```

- [ ] **Step 6: Update the traffic panel's explanations**

The server already classifies `/auctions/{id}` as `detail` regardless of the session (`functions/src/insights/log-page-view-rules.ts`), so views from anonymous visitors start counting without code changes. What stops being true is the text that says they can't exist.

En `apps/web/src/lib/insights/traffic-summary.ts`, sobre `ANONYMOUS_FUNNEL_STAGES`, agregar al principio del comentario:

```ts
 * UPDATE 2026-09-26: `/auctions/[id]` moved to the (abierto) group and is
 * public for retail auctions (docs/superpowers/specs/2026-09-26-paginas-
 * publicas-subastas-design.md). From that day `detail` counts BOTH anonymous
 * and signed-in sessions, and an ad linking to a vehicle produces a `detail`
 * view instead of a `login` one. The stage lists stay as they are because
 * the aggregate can't tell the two populations apart; the panel copy says so.
```

En `traffic-panel.tsx`, reemplazar las dos `description`:

```tsx
description={`Visitantes sin cuenta: cuántos entraron a la home y cuántos llegaron al login. Desde el 26/9/2026 también pueden abrir fichas sin cuenta; esas vistas se cuentan en el bloque de abajo. Últimos ${dias}.`}
```

```tsx
description={`Catálogo visto (solo con cuenta) y fichas abiertas. Desde el 26/9/2026 las fichas son públicas, así que ese número suma visitas con y sin cuenta. Últimos ${dias}.`}
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test`
Expected: sin errores; todos los tests pasan (los nuevos de `whatsapp` incluidos).

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src/lib/share apps/web/src/components/public "apps/web/src/app/[locale]/(abierto)" apps/web/src/lib/insights/traffic-summary.ts "apps/web/src/app/[locale]/(protected)/staff/insights/_components/traffic-panel.tsx"
git commit -m "feat(subasta-publica): ficha pública con cuenta, compartir y otras subastas

Sin sesión, /{locale}/auctions/{id} muestra todo menos pujar: fotos,
ficha sin chapa ni VIN, precio, cuenta regresiva y financiación, con
'Creá tu cuenta para pujar'. Al terminar, según el resultado: vendida
visible con franja, redirección a la subasta nueva del mismo vehículo o
'Subasta finalizada'. Metadata y datos estructurados por subasta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Imagen para redes por subasta

**Files:**

- Create: `apps/web/src/lib/seo/og-photo.ts`
- Test: `apps/web/src/lib/seo/og-photo.test.ts`
- Create: `apps/web/src/app/[locale]/(abierto)/auctions/[id]/opengraph-image.tsx`
- Modify: `apps/web/src/middleware.test.ts` (un caso nuevo)

**Interfaces:**

- Consumes: `loadPublicAuction` (Task 1), `vehicleAlt`, `formatAmount`, `formatDateTimePy`.
- Produces: `photoDataUri(url: string, fetchImpl?: typeof fetch): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/seo/og-photo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { photoDataUri } from './og-photo';

const fakeFetch = (type: string, status = 200, body = new Uint8Array([1, 2, 3])) =>
  (async () =>
    new Response(body, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('photoDataUri', () => {
  it('embeds a JPEG as a data URI', async () => {
    expect(await photoDataUri('https://img.test/a.jpg', fakeFetch('image/jpeg'))).toBe(
      'data:image/jpeg;base64,AQID',
    );
  });

  it('gives up on formats the image renderer cannot draw', async () => {
    expect(await photoDataUri('https://img.test/a.webp', fakeFetch('image/webp'))).toBeNull();
  });

  it('gives up when the photo is missing', async () => {
    expect(await photoDataUri('https://img.test/a.jpg', fakeFetch('image/jpeg', 404))).toBeNull();
  });

  it('gives up when the network fails', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await photoDataUri('https://img.test/a.jpg', failing)).toBeNull();
  });
});
```

Agregar a `apps/web/src/middleware.test.ts`, dentro del `describe`:

```ts
it('lets an auction page and its social image through (both are public now)', () => {
  expect(run('/es/auctions/auc-1').status).not.toBe(404);
  expect(run('/es/auctions/auc-1/opengraph-image').status).not.toBe(404);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/web && npx vitest run src/lib/seo/og-photo.test.ts src/middleware.test.ts`
Expected: FAIL en `og-photo` (`Failed to load url ./og-photo`); el caso nuevo del middleware ya pasa (`auctions` está en la lista), lo que confirma que no hay que tocar el middleware.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/seo/og-photo.ts`:

```ts
/**
 * The auction photo for the social preview, as a data URI.
 *
 * The image renderer behind next/og draws JPEG and PNG; thumbnails are WebP
 * since 2026-09-26, so the caller passes the original photo. Anything it
 * cannot draw — WebP, HEIC, a missing file, a network error — returns null
 * and the card goes out text-only instead of failing.
 */
export async function photoDataUri(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (type !== 'image/jpeg' && type !== 'image/png') return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    // Past 4 MB the card takes too long to render for a chat unfurl.
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
```

`apps/web/src/app/[locale]/(abierto)/auctions/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { loadPublicAuction } from '@/lib/buyer/load-public-auction';
import { photoDataUri } from '@/lib/seo/og-photo';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { vehicleAlt } from '@/lib/format/vehicle-alt';

export const runtime = 'nodejs';
// Regenerated at most every 5 minutes per auction (spec §7): enough for the
// price in a forwarded WhatsApp preview, cheap for Netlify.
export const revalidate = 300;
export const alt = 'Vehículo en subasta · Renew Subastas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params: { id } }: { params: { id: string } }) {
  // Wholesale or unknown ids get the generic card: nothing private leaks.
  const d = await loadPublicAuction(id);
  const photo = d?.images[0] ? await photoDataUri(d.images[0].url) : null;
  const title = d
    ? vehicleAlt(d.make, d.model, d.year)
    : 'Subastas de vehículos usados certificados';
  const price = d ? `USD ${formatAmount(d.currentBid > 0 ? d.currentBid : d.startingPrice)}` : '';
  const when =
    d?.status === 'live'
      ? `Cierra el ${formatDateTimePy('es', d.endsAtMs)}`
      : d?.status === 'scheduled'
        ? `Abre el ${formatDateTimePy('es', d.startsAtMs)}`
        : '';

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0a0a0a' }}>
      {photo ? <img src={photo} width={630} height={630} style={{ objectFit: 'cover' }} /> : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '56px 56px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            letterSpacing: 5,
            color: '#a1a1aa',
            textTransform: 'uppercase',
          }}
        >
          Renew Subastas
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 58,
              lineHeight: 1.05,
              fontWeight: 700,
              color: '#fafafa',
            }}
          >
            {title}
          </div>
          {price ? (
            <div
              style={{
                display: 'flex',
                marginTop: 20,
                fontSize: 44,
                fontWeight: 700,
                color: '#fafafa',
              }}
            >
              {price}
            </div>
          ) : null}
          {when ? (
            <div style={{ display: 'flex', marginTop: 12, fontSize: 28, color: '#a1a1aa' }}>
              {when}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#71717a' }}>renewsubastas.com.py</div>
      </div>
    </div>,
    size,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/lib/seo/og-photo.test.ts src/middleware.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo/og-photo.ts apps/web/src/lib/seo/og-photo.test.ts "apps/web/src/app/[locale]/(abierto)/auctions/[id]/opengraph-image.tsx" apps/web/src/middleware.test.ts
git commit -m "feat(seo): imagen para redes de cada subasta con foto, precio y cierre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sitemap con las subastas abiertas

**Files:**

- Create: `apps/web/src/lib/seo/sitemap-entries.ts`
- Test: `apps/web/src/lib/seo/sitemap-entries.test.ts` (reemplaza a `apps/web/src/app/sitemap.test.ts`, que se borra)
- Modify: `apps/web/src/app/sitemap.ts`

**Interfaces:**

- Consumes: `SITE_URL`, `INDEXED_LOCALES`, `DEFAULT_LOCALE`, `INDEXABLE_PATHS` (`lib/seo/site.ts`); `listLandingAuctions()`.
- Produces: `buildSitemap(auctionIds: string[], now: Date): MetadataRoute.Sitemap`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/seo/sitemap-entries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSitemap } from './sitemap-entries';

const NOW = new Date('2026-09-26T20:00:00Z');

describe('buildSitemap', () => {
  it('lists the Spanish landing and legal pages, without login or English', () => {
    expect(buildSitemap([], NOW).map((e) => e.url)).toEqual([
      'https://renewsubastas.com.py/es',
      'https://renewsubastas.com.py/es/terminos',
      'https://renewsubastas.com.py/es/privacidad',
      'https://renewsubastas.com.py/es/cookies',
    ]);
  });

  it('adds one entry per open auction on its single link', () => {
    const urls = buildSitemap(['auc-1', 'auc-2'], NOW).map((e) => e.url);
    expect(urls.slice(4)).toEqual([
      'https://renewsubastas.com.py/es/auctions/auc-1',
      'https://renewsubastas.com.py/es/auctions/auc-2',
    ]);
  });

  it('declares only indexed languages as alternates', () => {
    for (const e of buildSitemap(['auc-1'], NOW)) {
      expect(Object.keys(e.alternates?.languages ?? {})).toEqual(['es', 'x-default']);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/seo/sitemap-entries.test.ts`
Expected: FAIL — `Failed to load url ./sitemap-entries`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/seo/sitemap-entries.ts`:

```ts
import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, INDEXABLE_PATHS, INDEXED_LOCALES, SITE_URL } from './site';

function languages(path: string) {
  return Object.fromEntries([
    ...INDEXED_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]),
    ['x-default', `${SITE_URL}/${DEFAULT_LOCALE}${path}`],
  ]);
}

/**
 * Pure half of the sitemap, so it is testable without Firestore
 * (app/sitemap.ts imports a server-only loader).
 *
 * Auctions enter only while open (scheduled or live) and leave when they
 * close (spec 2026-09-26 §7); no lastModified for them, since a bid changes
 * the page and the sitemap is regenerated at most hourly.
 */
export function buildSitemap(auctionIds: string[], now: Date): MetadataRoute.Sitemap {
  const pages = INDEXABLE_PATHS.flatMap((path) =>
    INDEXED_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === '' ? ('daily' as const) : ('monthly' as const),
      priority: path === '' ? 1 : 0.4,
      alternates: { languages: languages(path) },
    })),
  );
  const auctions = auctionIds.flatMap((id) =>
    INDEXED_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}/auctions/${id}`,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
      alternates: { languages: languages(`/auctions/${id}`) },
    })),
  );
  return [...pages, ...auctions];
}
```

`apps/web/src/app/sitemap.ts` completo:

```ts
import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo/sitemap-entries';
import { listLandingAuctions } from '@/lib/buyer/landing-auctions';

// At most once an hour: auctions come and go, the static pages don't.
export const revalidate = 3600;

/**
 * The landing and legal pages, plus every open retail auction (its public
 * page since 2026-09-26). If the catalog can't be read, the static part
 * still goes out rather than the whole sitemap failing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listLandingAuctions().catch(() => []);
  const open = items
    .filter((a) => a.status === 'live' || a.status === 'scheduled')
    .map((a) => a.id);
  return buildSitemap(open, new Date());
}
```

Borrar el test viejo: `git rm apps/web/src/app/sitemap.test.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/lib/seo/sitemap-entries.test.ts && pnpm --filter @carbid/web typecheck`
Expected: PASS (3 tests), typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/seo/sitemap-entries.ts apps/web/src/lib/seo/sitemap-entries.test.ts apps/web/src/app/sitemap.ts
git commit -m "feat(seo): el sitemap suma las subastas minoristas abiertas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Las tarjetas de la portada llevan a la ficha

**Files:**

- Modify: `apps/web/src/components/public/public-auction-card.tsx`

**Interfaces:**

- Consumes: `auctionPath(locale, id)` (Task 1).

- [ ] **Step 1: Change the link and the texts**

En `public-auction-card.tsx`:

1. Agregar `import { auctionPath } from '@/lib/buyer/public-auction';`.
2. Reemplazar `const loginHref = …;` por `const href = auctionPath(locale, auction.id);` y cada `href={loginHref as \`/${string}\`}`por`href={href}`.
3. Reemplazar `const overlayAriaLabel = isSold ? \`${title} — vendido\` : \`${title} — iniciar sesión para pujar\`;`por`const overlayAriaLabel = isSold ? \`${title} — vendido\` : \`${title} — ver subasta\`;`.
4. En el botón del pie (el `<Link>` que hoy dice "Iniciar sesión para pujar" junto al ícono `LogIn`), cambiar el texto por `Ver subasta` y el ícono `LogIn` por `ArrowRight` (import desde `lucide-react`; quitar `LogIn` si queda sin uso).
5. Actualizar el comentario del componente y el del overlay: la tarjeta lleva a la página pública de la subasta (spec 2026-09-26), que es la que invita a crear cuenta.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/public/public-auction-card.tsx
git commit -m "feat(portada): las tarjetas llevan a la ficha pública en lugar del login

Era el muro de la auditoría del 26/9: 87% de las visitas no pasaba de la
portada porque ver un auto exigía cuenta.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación de punta a punta y cierre

Todo contra emuladores; nada toca producción.

**Files:**

- Create: `functions/scripts/verify-public-auctions.ts`

- [ ] **Step 1: Create the verification script**

`functions/scripts/verify-public-auctions.ts`:

```ts
// End-to-end checks of the public auction pages, against the EMULATORS ONLY.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/verify-public-auctions.ts
//
// Needs: emulators up with seed-demo-video loaded, and `next start -p 3016`
// of apps/web running with the same emulator variables.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env['FIRESTORE_EMULATOR_HOST']) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set.');
  process.exit(1);
}

const BASE = 'http://localhost:3016';
initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'carbid-staging' });
const db = getFirestore();
let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const get = (path: string, cookie?: string) =>
  fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie: `__session=${cookie}` } : {},
  });

async function main() {
  const live = await get('/es/auctions/demo-auction-3');
  const html = await live.text();
  check(live.status === 200, 'ficha en vivo abre sin cuenta', String(live.status));
  check(html.includes('Creá tu cuenta para pujar'), 'muestra la tarjeta de cuenta');
  check(!html.includes('Confirmar puja'), 'no muestra el panel de puja');

  const vehicleId = (await db.doc('auctions/demo-auction-3').get()).data()?.['vehicleId'] as string;
  const v = (await db.doc(`vehicles/${vehicleId}`).get()).data() ?? {};
  for (const [name, value] of [
    ['VIN', v['vin']],
    ['chapa', v['licensePlate']],
  ] as const) {
    if (typeof value === 'string' && value)
      check(!html.includes(value), `el HTML público no trae ${name}`);
  }
  check(html.includes('"@type":"Car"'), 'datos estructurados de vehículo');
  check(!/<meta name="robots"/.test(html), 'indexable mientras está abierta');

  // Every seeded auction (one per state: about to open, open, Compra ya,
  // contested, won, reserve not met) answers, and none leaks its VIN/plate.
  for (const doc of (await db.collection('auctions').get()).docs) {
    const a = doc.data();
    const res = await get(`/es/auctions/${doc.id}`);
    const label = `${doc.id} (${a['status']}/${a['outcome'] ?? '-'})`;
    if ((a['audience'] ?? 'retail') !== 'retail') {
      check(res.status === 404, `${label} mayorista: 404`);
      continue;
    }
    check(res.status === 200 || res.status === 307, `${label} responde`, String(res.status));
    if (res.status !== 200) continue;
    const body = await res.text();
    const veh = (await db.doc(`vehicles/${a['vehicleId']}`).get()).data() ?? {};
    for (const secret of [veh['vin'], veh['licensePlate']]) {
      if (typeof secret === 'string' && secret)
        check(!body.includes(secret), `${label} sin VIN ni chapa`);
    }
    if (a['status'] === 'scheduled')
      check(body.includes('Abre en'), `${label} muestra cuándo abre`);
  }

  const finished = await (await get('/es/auctions/demo-auction-5')).text();
  check(finished.includes('Subasta finalizada'), 'sin vender y sin subasta nueva: finalizada');
  check(
    /<meta name="robots" content="noindex, follow"/.test(finished),
    'finalizada fuera del índice',
  );

  // A wholesale auction must never be public.
  await db
    .doc('auctions/verify-wholesale')
    .set({ ...(await db.doc('auctions/demo-auction-3').get()).data(), audience: 'wholesale' });
  check((await get('/es/auctions/verify-wholesale')).status === 404, 'mayorista da 404 sin cuenta');
  await db.doc('auctions/verify-wholesale').delete();

  const og = await get('/es/auctions/demo-auction-3/opengraph-image');
  check(
    og.status === 200 && og.headers.get('content-type') === 'image/png',
    'imagen para redes de la subasta',
  );

  const sitemap = await (await get('/sitemap.xml')).text();
  check(sitemap.includes('/es/auctions/demo-auction-3'), 'el sitemap trae la subasta en vivo');
  check(!sitemap.includes('/es/auctions/demo-auction-5'), 'el sitemap no trae la finalizada');

  const landing = await (await get('/es')).text();
  check(landing.includes('href="/es/auctions/demo-auction-3"'), 'la portada lleva a la ficha');

  // Signed in: the page must be exactly today's buyer view.
  const sessionFor = async (email: string) => {
    const r = await fetch(
      `http://${process.env['FIREBASE_AUTH_EMULATOR_HOST']}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Demo123456', returnSecureToken: true }),
      },
    );
    const { idToken } = (await r.json()) as { idToken: string };
    return getAuth().createSessionCookie(idToken, { expiresIn: 3_600_000 });
  };
  const buyer = await sessionFor('demo.comprador@renew.test');
  const signedIn = await get('/es/auctions/demo-auction-3', buyer);
  const signedInHtml = await signedIn.text();
  check(signedIn.status === 200, 'con sesión minorista: la ficha abre');
  check(!signedInHtml.includes('Creá tu cuenta para pujar'), 'con sesión: sin la tarjeta pública');

  // A wholesale buyer still can't see a retail auction (unchanged rule).
  const wholesale = await sessionFor('demo.mayorista@renew.test');
  check(
    (await get('/es/auctions/demo-auction-3', wholesale)).status === 404,
    'mayorista con sesión: 404 en minorista',
  );

  console.log(`\n${failures === 0 ? 'Todo bien' : `${failures} fallas`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Las cuentas (`demo.comprador@renew.test`, `demo.mayorista@renew.test`, contraseña `Demo123456`) y las subastas `demo-auction-0` a `demo-auction-5` salen de `functions/scripts/seed-demo-video.ts`; son datos de emulador, no de producción.

- [ ] **Step 2: Run the full local check**

```bash
npx -y firebase-tools@latest emulators:start --only auth,firestore --project carbid-staging
```

En otra terminal:

```bash
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/seed-demo-video.ts
```

```bash
cd apps/web && npx next build && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging GOOGLE_CLOUD_PROJECT=carbid-staging NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-staging npx next start -p 3016
```

```bash
cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/verify-public-auctions.ts
```

Expected: todas las líneas con ✓ y "Todo bien".

- [ ] **Step 3: Lighthouse of the public page (with the server still up)**

```bash
CHROME_PATH=/usr/bin/google-chrome npx -y lighthouse@12 http://localhost:3016/es/auctions/demo-auction-3 --quiet --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility,seo --form-factor=mobile --output=json --output-path=/tmp/lh-ficha.json
```

Expected: SEO y accesibilidad ≥ 95; se anota el rendimiento para compararlo en producción después del deploy.

- [ ] **Step 4: Final checks and commit**

Run: `pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web lint && pnpm --filter @carbid/web test && pnpm exec prettier --check "apps/web/src/**/*.{ts,tsx}" functions/scripts/verify-public-auctions.ts`
Expected: todo limpio.

```bash
git add functions/scripts/verify-public-auctions.ts
git commit -m "test(subasta-publica): verificación de punta a punta contra emuladores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**No hacer `git push`:** el deploy (un solo push a `main`, 15 créditos) lo decide Croman, idealmente junto con los textos legales revisados.
