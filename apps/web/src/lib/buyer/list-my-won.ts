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
  paymentStatus: 'pending_payment' | 'paid' | 'forfeited' | null;
  paymentDeadlineMs: number | null;
  paymentDepositUsd: number | null;
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
      paymentStatus:
        (a['paymentStatus'] as 'pending_payment' | 'paid' | 'forfeited' | undefined) ?? null,
      paymentDeadlineMs:
        (a['paymentDeadline'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
      paymentDepositUsd: (a['paymentDepositUsd'] as number | undefined) ?? null,
    };
  });
}
