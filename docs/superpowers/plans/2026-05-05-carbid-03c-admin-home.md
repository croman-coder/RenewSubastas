# CARBID Plan 3c — Admin Home Dashboard (KPIs + Charts)

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Replace the admin home placeholder with a live dashboard showing KPIs (active users by role, auctions in progress, GMV, bids today), two charts (auctions by status donut, bids per day line for last 30d), a "closing soon" list, and the last 10 audit log entries.

**Architecture:**

- Server component `/[locale]/(protected)/admin/page.tsx` aggregates data via Firebase Admin SDK and passes plain JSON to client components.
- Aggregations use Firestore `count()` queries where possible (admin SDK v12+) for efficiency. Bids/day uses collectionGroup query with day bucketing.
- Charts are client components using `recharts` (already installed via shadcn ecosystem? — check; if not, install).
- Reuses existing `listAudit` helper (Plan 3b) for the recent activity list.

**Spec reference:** §6 admin home table (KPIs, gráficos, listas).

**Prerequisites:** Plans 1-3b complete.

---

## File Structure

```
apps/web/src/
├── lib/admin/
│   └── load-dashboard-stats.ts        new — server aggregator
└── app/[locale]/(protected)/admin/
    ├── page.tsx                       REPLACE placeholder
    └── _components/
        ├── kpi-cards.tsx              client (server-rendered, no client logic)
        ├── auctions-by-status-chart.tsx  client (recharts donut)
        ├── bids-per-day-chart.tsx     client (recharts line)
        ├── closing-soon-list.tsx      client/server (just list rendering)
        └── recent-audit-list.tsx
```

---

## Task 1: Install recharts (if missing)

- [ ] **Step 1.1:**

```
pnpm --filter @carbid/web list recharts | head -5  # check
pnpm --filter @carbid/web add recharts  # only if not present
```

---

## Task 2: Server aggregator

- [ ] **Step 2.1: Create** `apps/web/src/lib/admin/load-dashboard-stats.ts`:

```ts
import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface DashboardStats {
  usersByRole: { admin: number; staff: number; buyer: number };
  liveAuctions: number;
  scheduledAuctions: number;
  endedAuctions: number;
  gmvUsd: number;
  bidsToday: number;
  bidsByDay: Array<{ date: string; count: number }>; // last 30 days
  closingSoon: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    currentBid: number;
    endsAtMs: number;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    actorUid: string;
    resourceType: string;
    resourceId: string;
    createdAtMs: number;
  }>;
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  const db = getFirestore(getAdminApp());

  // ---- Users by role (count() aggregations) ----
  const [usersAdmin, usersStaff, usersBuyer] = await Promise.all([
    db
      .collection('users')
      .where('role', '==', 'admin')
      .where('status', '==', 'active')
      .count()
      .get(),
    db
      .collection('users')
      .where('role', '==', 'staff')
      .where('status', '==', 'active')
      .count()
      .get(),
    db
      .collection('users')
      .where('role', '==', 'buyer')
      .where('status', '==', 'active')
      .count()
      .get(),
  ]);

  // ---- Auction counts by status ----
  const [aLive, aScheduled, aEnded] = await Promise.all([
    db.collection('auctions').where('status', '==', 'live').count().get(),
    db.collection('auctions').where('status', '==', 'scheduled').count().get(),
    db.collection('auctions').where('status', '==', 'ended').count().get(),
  ]);

  // ---- GMV: sum finalPrice across sold auctions ----
  const soldSnap = await db
    .collection('auctions')
    .where('status', '==', 'ended')
    .where('outcome', '==', 'sold')
    .select('finalPrice')
    .get();
  const gmvUsd = soldSnap.docs.reduce(
    (acc, d) => acc + ((d.data()['finalPrice'] as number | undefined) ?? 0),
    0,
  );

  // ---- Bids per day (last 30d) ----
  const now = Date.now();
  const thirtyAgo = Timestamp.fromMillis(now - 30 * 24 * 3600_000);
  const bidsSnap = await db
    .collectionGroup('bids')
    .where('createdAt', '>=', thirtyAgo)
    .select('createdAt')
    .get();

  const bidsByDayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600_000);
    bidsByDayMap.set(toDateKey(d), 0);
  }
  for (const doc of bidsSnap.docs) {
    const ts = doc.data()['createdAt'] as Timestamp | undefined;
    if (!ts) continue;
    const key = toDateKey(ts.toDate());
    bidsByDayMap.set(key, (bidsByDayMap.get(key) ?? 0) + 1);
  }
  const bidsByDay = Array.from(bidsByDayMap.entries()).map(([date, count]) => ({ date, count }));

  // ---- Bids today ----
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const bidsToday = bidsSnap.docs.filter((d) => {
    const ts = d.data()['createdAt'] as Timestamp | undefined;
    return ts && ts.toMillis() >= startOfToday.getTime();
  }).length;

  // ---- Closing soon (live, endsAt within 24h) ----
  const in24h = Timestamp.fromMillis(now + 24 * 3600_000);
  const closingSnap = await db
    .collection('auctions')
    .where('status', '==', 'live')
    .where('endsAt', '<=', in24h)
    .orderBy('endsAt', 'asc')
    .limit(5)
    .get();
  const closingSoon = closingSnap.docs.map((d) => {
    const a = d.data();
    const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    return {
      id: d.id,
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      currentBid: (a['currentBid'] as number) ?? 0,
      endsAtMs: (a['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
    };
  });

  // ---- Recent audit (top 10) ----
  const auditSnap = await db.collection('audit_logs').orderBy('createdAt', 'desc').limit(10).get();
  const recentAudit = auditSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: (data['action'] as string) ?? '',
      actorUid: (data['actorUid'] as string) ?? '',
      resourceType: (data['resourceType'] as string) ?? '',
      resourceId: (data['resourceId'] as string) ?? '',
      createdAtMs:
        (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
    };
  });

  return {
    usersByRole: {
      admin: usersAdmin.data().count,
      staff: usersStaff.data().count,
      buyer: usersBuyer.data().count,
    },
    liveAuctions: aLive.data().count,
    scheduledAuctions: aScheduled.data().count,
    endedAuctions: aEnded.data().count,
    gmvUsd,
    bidsToday,
    bidsByDay,
    closingSoon,
    recentAudit,
  };
}

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

---

## Task 3: Charts + cards components

- [ ] **Step 3.1: i18n** — append to `messages/es.json` inside `admin`:

```json
"home": {
  "title": "Inicio",
  "kpis": {
    "activeUsers": "Usuarios activos",
    "liveAuctions": "Subastas en curso",
    "gmv": "GMV (USD)",
    "bidsToday": "Pujas hoy"
  },
  "auctionsByStatus": "Subastas por estado",
  "bidsPerDay": "Pujas por día (30d)",
  "closingSoon": "Cierran en las próximas 24 horas",
  "recentAudit": "Últimas acciones",
  "noClosingSoon": "Ninguna subasta cerrando en 24h.",
  "noAudit": "Sin actividad reciente.",
  "viewAll": "Ver todas"
}
```

Same in en.json.

- [ ] **Step 3.2: KPI cards** `apps/web/src/app/[locale]/(protected)/admin/_components/kpi-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday }: Props) {
  const t = useTranslations('admin.home.kpis');
  const items = [
    { label: t('activeUsers'), value: usersTotal.toLocaleString() },
    { label: t('liveAuctions'), value: liveAuctions.toLocaleString() },
    { label: t('gmv'), value: gmvUsd.toLocaleString() },
    { label: t('bidsToday'), value: bidsToday.toLocaleString() },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader>
            <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wide">
              {it.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-text-strong num-tab">{it.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3.3: Donut chart** `auctions-by-status-chart.tsx`:

```tsx
'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTranslations } from 'next-intl';

interface Props {
  live: number;
  scheduled: number;
  ended: number;
}

export function AuctionsByStatusChart({ live, scheduled, ended }: Props) {
  const t = useTranslations('admin.home');
  const tStatus = useTranslations('staff.auctions.status');
  const data = [
    { name: tStatus('live'), value: live, color: 'oklch(60% 0.13 155)' },
    { name: tStatus('scheduled'), value: scheduled, color: 'oklch(70% 0.14 75)' },
    { name: tStatus('ended'), value: ended, color: 'oklch(48% 0.01 290)' },
  ];
  const total = live + scheduled + ended;
  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium text-text-strong">{t('auctionsByStatus')}</h2>
      {total === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">—</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={28} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.4: Line chart** `bids-per-day-chart.tsx`:

```tsx
'use client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';

interface Props {
  data: Array<{ date: string; count: number }>;
}

export function BidsPerDayChart({ data }: Props) {
  const t = useTranslations('admin.home');
  const totalBids = data.reduce((acc, d) => acc + d.count, 0);
  // Show only month-day on the X axis
  const formatted = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium text-text-strong">{t('bidsPerDay')}</h2>
      {totalBids === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">—</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(64% 0.01 290 / 0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="oklch(68% 0.13 55)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.5: Lists** — `closing-soon-list.tsx` and `recent-audit-list.tsx`. Both server-renderable, no client-only logic.

`closing-soon-list.tsx`:

```tsx
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

interface Props {
  locale: string;
  items: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    currentBid: number;
    endsAtMs: number;
  }>;
}

export function ClosingSoonList({ locale, items }: Props) {
  const t = useTranslations('admin.home');
  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-strong">{t('closingSoon')}</h2>
        <Link
          href={`/${locale}/admin` as `/${string}`}
          className="text-xs text-text-muted hover:text-text-strong"
        >
          {t('viewAll')}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{t('noClosingSoon')}</p>
      ) : (
        <ul className="divide-y divide-text-subtle/20">
          {items.map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between text-sm">
              <Link
                href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                className="hover:underline"
              >
                {a.make} {a.model} {a.year}
              </Link>
              <span className="num-tab text-text-muted text-xs">
                USD {a.currentBid.toLocaleString()} · {new Date(a.endsAtMs).toLocaleString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`recent-audit-list.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface Props {
  locale: string;
  items: Array<{
    id: string;
    action: string;
    actorUid: string;
    resourceType: string;
    resourceId: string;
    createdAtMs: number;
  }>;
}

export function RecentAuditList({ locale, items }: Props) {
  const t = useTranslations('admin.home');
  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-strong">{t('recentAudit')}</h2>
        <Link
          href={`/${locale}/admin/audit` as `/${string}`}
          className="text-xs text-text-muted hover:text-text-strong"
        >
          {t('viewAll')}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{t('noAudit')}</p>
      ) : (
        <ul className="divide-y divide-text-subtle/20">
          {items.map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{e.action}</Badge>
                <span className="font-mono text-text-muted">{e.resourceId.slice(0, 8)}</span>
              </span>
              <span className="text-text-muted num-tab">
                {new Date(e.createdAtMs).toLocaleTimeString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## Task 4: Replace admin home page

- [ ] **Step 4.1: REPLACE** `apps/web/src/app/[locale]/(protected)/admin/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { loadDashboardStats } from '@/lib/admin/load-dashboard-stats';
import { KpiCards } from './_components/kpi-cards';
import { AuctionsByStatusChart } from './_components/auctions-by-status-chart';
import { BidsPerDayChart } from './_components/bids-per-day-chart';
import { ClosingSoonList } from './_components/closing-soon-list';
import { RecentAuditList } from './_components/recent-audit-list';

export default async function AdminHome({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('admin.home');
  const s = await loadDashboardStats();

  const usersTotal = s.usersByRole.admin + s.usersByRole.staff + s.usersByRole.buyer;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <KpiCards
        usersTotal={usersTotal}
        liveAuctions={s.liveAuctions}
        gmvUsd={s.gmvUsd}
        bidsToday={s.bidsToday}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AuctionsByStatusChart
          live={s.liveAuctions}
          scheduled={s.scheduledAuctions}
          ended={s.endedAuctions}
        />
        <BidsPerDayChart data={s.bidsByDay} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClosingSoonList locale={locale} items={s.closingSoon} />
        <RecentAuditList locale={locale} items={s.recentAudit} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Build, format, commit**

```
pnpm --filter @carbid/web typecheck && pnpm --filter @carbid/web build && pnpm format
git add apps/web/src/lib/admin/load-dashboard-stats.ts apps/web/src/app/[locale]/'(protected)'/admin apps/web/messages apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): admin home dashboard with KPIs, charts, closing-soon and audit"
```

---

## Task 5: Smoke test

1. Login admin, ensure demo data is loaded (`pnpm seed:demo` if not).
2. Navigate to `/admin`.
3. KPI row shows numbers (active users, live auctions count, GMV from sold auctions, bids today).
4. Donut chart shows auction distribution by status.
5. Line chart shows bids/day for last 30 days (mostly 0 unless you've been bidding).
6. "Cierran en las próximas 24h" lists VW Amarok and Tesla (from demo data).
7. "Últimas acciones" shows recent audit entries (e.g. `app_config.update`, `auction.create`).
8. Click "Ver todas" on audit → goes to `/admin/audit`.

---

## Self-Review

Spec coverage (§6 admin home):

- KPIs (usuarios activos por rol, subastas en curso, GMV, pujas hoy) ✅
- Gráficos: subastas por estado donut + pujas por día line ✅
- Lista subastas que cierran pronto ✅
- Últimas acciones del audit log ✅

Note on aggregation:

- Uses Firestore `count()` aggregation queries (admin SDK v12+).
- Bids per day requires reading bid docs (no count-by-bucket aggregation in Firestore yet) — for current scale this is fine.

Out of scope:

- Pujas-by-day chart with multiple lines (e.g., bids vs new auctions): post-MVP.
- Drill-down on KPI clicks: post-MVP.

---

## Execution Handoff

Single batch:

- Batch UU: Tasks 1-4 (helper + components + page).
