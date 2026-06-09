import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { loadAppConfig } from '../lib/config.js';
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

  // Pull payment config once per tick so each close transaction can stamp
  // the deadline without re-reading app_config for every auction.
  const cfg = liveSnap.size > 0 ? await loadAppConfig() : null;
  const deadlineHours = cfg?.payment.deadlineHours ?? 24;
  const depositPercent = cfg?.payment.depositPercent ?? 0.1;

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
        // Payment window opens when the auction closes. The buyer has
        // `deadlineHours` (default 24) to wire the deposit. Stored as a
        // Firestore Timestamp so a separate cron pass can sweep
        // overdue auctions into `forfeited` deterministically.
        auctionUpdate['paymentStatus'] = 'pending_payment';
        auctionUpdate['paymentDepositPercent'] = depositPercent;
        auctionUpdate['paymentDepositUsd'] = Math.round(currentBid * depositPercent * 100) / 100;
        auctionUpdate['paymentDeadline'] = Timestamp.fromMillis(now + deadlineHours * 3600_000);
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

  // ---- Pass 3: forfeit auctions whose payment deadline passed ----
  // Won-but-unpaid auctions whose paymentDeadline elapsed transition to
  // paymentStatus=forfeited and the vehicle returns to status=ready so
  // it can be re-listed. Runs in the same tick to keep operational
  // surface area small.
  //
  // WRAPPED IN TRY/CATCH: this query needs a 4-field composite index.
  // If that index is missing or still building, the forfeit sweep must
  // NOT take down Pass 1 (promote) and Pass 2 (close) with it — those
  // are the critical paths that set winnerUid and fire the won email.
  // A forfeit that's a minute late is harmless; a close that never
  // happens is not.
  try {
    const expiredSnap = await db
      .collection('auctions')
      .where('status', '==', 'ended')
      .where('outcome', '==', 'sold')
      .where('paymentStatus', '==', 'pending_payment')
      .where('paymentDeadline', '<=', nowTs)
      .limit(200)
      .get();

    for (const eDoc of expiredSnap.docs) {
      const a = eDoc.data();
      await eDoc.ref.update({
        paymentStatus: 'forfeited',
        paymentStatusUpdatedAt: FieldValue.serverTimestamp(),
        paymentStatusUpdatedBy: 'system',
        updatedAt: FieldValue.serverTimestamp(),
      });
      const vehicleId = a['vehicleId'] as string | undefined;
      if (vehicleId) {
        await db.doc(`vehicles/${vehicleId}`).update({
          status: 'ready',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await writeAuditLog({
        actorUid: 'system',
        action: 'auction.forfeited',
        resourceType: 'auction',
        resourceId: eDoc.id,
        after: { reason: 'payment_deadline_expired' },
      });
    }
  } catch (err) {
    console.error('[tickAuctions] forfeit sweep failed (non-fatal)', err);
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
