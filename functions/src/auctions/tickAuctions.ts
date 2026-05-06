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
