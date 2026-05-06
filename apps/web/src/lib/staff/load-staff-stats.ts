import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface StaffStats {
  vehicles: { draft: number; ready: number; inAuction: number; sold: number };
  auctions: { scheduled: number; live: number; ended: number };
}

async function safeCount(p: Promise<{ data: () => { count: number } }>): Promise<number> {
  try {
    const s = await p;
    return s.data().count;
  } catch {
    return 0;
  }
}

export async function loadStaffStats(uid: string): Promise<StaffStats> {
  const db = getFirestore(getAdminApp());

  const v = (status: string) =>
    db
      .collection('vehicles')
      .where('createdBy', '==', uid)
      .where('status', '==', status)
      .count()
      .get();

  const a = (status: string) =>
    db
      .collection('auctions')
      .where('createdBy', '==', uid)
      .where('status', '==', status)
      .count()
      .get();

  const [draft, ready, inAuction, sold, scheduled, live, ended] = await Promise.all([
    safeCount(v('draft')),
    safeCount(v('ready')),
    safeCount(v('in_auction')),
    safeCount(v('sold')),
    safeCount(a('scheduled')),
    safeCount(a('live')),
    safeCount(a('ended')),
  ]);

  return {
    vehicles: { draft, ready, inAuction, sold },
    auctions: { scheduled, live, ended },
  };
}
