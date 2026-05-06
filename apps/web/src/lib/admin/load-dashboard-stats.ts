import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp, type QuerySnapshot } from 'firebase-admin/firestore';

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

// Wrap a Firestore query so a missing collection or missing index does not
// crash the dashboard render on a fresh project.
async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn(`[dashboard] ${label} failed, using fallback`, err);
    return fallback;
  }
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  const db = getFirestore(getAdminApp());

  // ---- Users by role (count() aggregations) ----
  const [usersAdmin, usersStaff, usersBuyer] = await Promise.all([
    safe(
      db
        .collection('users')
        .where('role', '==', 'admin')
        .where('status', '==', 'active')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'usersAdmin',
    ),
    safe(
      db
        .collection('users')
        .where('role', '==', 'staff')
        .where('status', '==', 'active')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'usersStaff',
    ),
    safe(
      db
        .collection('users')
        .where('role', '==', 'buyer')
        .where('status', '==', 'active')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'usersBuyer',
    ),
  ]);

  // ---- Auction counts by status ----
  const [aLive, aScheduled, aEnded] = await Promise.all([
    safe(
      db
        .collection('auctions')
        .where('status', '==', 'live')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'aLive',
    ),
    safe(
      db
        .collection('auctions')
        .where('status', '==', 'scheduled')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'aScheduled',
    ),
    safe(
      db
        .collection('auctions')
        .where('status', '==', 'ended')
        .count()
        .get()
        .then((s) => s.data().count),
      0,
      'aEnded',
    ),
  ]);

  // ---- GMV: sum finalPrice across sold auctions ----
  const gmvUsd = await safe(
    db
      .collection('auctions')
      .where('status', '==', 'ended')
      .where('outcome', '==', 'sold')
      .select('finalPrice')
      .get()
      .then((soldSnap) =>
        soldSnap.docs.reduce(
          (acc, d) => acc + ((d.data()['finalPrice'] as number | undefined) ?? 0),
          0,
        ),
      ),
    0,
    'gmv',
  );

  // ---- Bids per day (last 30d) ----
  const now = Date.now();
  const thirtyAgo = Timestamp.fromMillis(now - 30 * 24 * 3600_000);
  const bidsSnap: QuerySnapshot | null = await safe(
    db
      .collectionGroup('bids')
      .where('createdAt', '>=', thirtyAgo)
      .select('createdAt')
      .get() as Promise<QuerySnapshot | null>,
    null,
    'bidsCollectionGroup',
  );

  const bidsByDayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600_000);
    bidsByDayMap.set(toDateKey(d), 0);
  }
  let bidsToday = 0;
  if (bidsSnap) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const doc of bidsSnap.docs) {
      const ts = doc.data()['createdAt'] as Timestamp | undefined;
      if (!ts) continue;
      const key = toDateKey(ts.toDate());
      bidsByDayMap.set(key, (bidsByDayMap.get(key) ?? 0) + 1);
      if (ts.toMillis() >= startOfToday.getTime()) bidsToday++;
    }
  }
  const bidsByDay = Array.from(bidsByDayMap.entries()).map(([date, count]) => ({ date, count }));

  // ---- Closing soon (live, endsAt within 24h) ----
  const in24h = Timestamp.fromMillis(now + 24 * 3600_000);
  const closingSoon = await safe(
    db
      .collection('auctions')
      .where('status', '==', 'live')
      .where('endsAt', '<=', in24h)
      .orderBy('endsAt', 'asc')
      .limit(5)
      .get()
      .then((closingSnap) =>
        closingSnap.docs.map((d) => {
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
        }),
      ),
    [] as DashboardStats['closingSoon'],
    'closingSoon',
  );

  // ---- Recent audit (top 10) ----
  const recentAudit = await safe(
    db
      .collection('audit_logs')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
      .then((auditSnap) =>
        auditSnap.docs.map((d) => {
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
        }),
      ),
    [] as DashboardStats['recentAudit'],
    'recentAudit',
  );

  return {
    usersByRole: { admin: usersAdmin, staff: usersStaff, buyer: usersBuyer },
    liveAuctions: aLive,
    scheduledAuctions: aScheduled,
    endedAuctions: aEnded,
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
