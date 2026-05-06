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
