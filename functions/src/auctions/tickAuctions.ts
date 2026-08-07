import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { loadAppConfig } from '../lib/config.js';
import { closeAuctionAsSold } from '../lib/close-auction.js';
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
    // Each close is isolated: a single auction that fails to close (e.g. its
    // vehicle was hard-deleted, or transient contention) must NOT abort the
    // rest of the batch — otherwise one "poison" auction could wedge every
    // later auction past its endsAt, leaving them open with bidders still
    // bidding. Log and move on; the next tick retries the failed one.
    try {
      const result = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return null;
        const a = fresh.data()!;

        // Recheck — another tick may have closed it.
        if (a['status'] !== 'live') return null;
        const endsAt = a['endsAt'] as Timestamp;
        if (endsAt.toMillis() > now) return null;

        // Read the vehicle (if any) and the private reserve BEFORE any write
        // — Firestore requires all reads before writes, and we must tolerate
        // a vehicle that was hard-deleted while the auction was live
        // (updating a missing doc throws NOT_FOUND and would otherwise
        // abort this close).
        const vehicleId = a['vehicleId'] as string | undefined;
        const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
        const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;
        // reservePrice lives in the buyer-unreadable private/internal doc,
        // not on this doc — see AuctionPrivateSchema.
        const privateSnap = await tx.get(doc.ref.collection('private').doc('internal'));
        const reservePrice = privateSnap.data()?.['reservePrice'] as number | undefined;

        const currentBid = (a['currentBid'] as number) ?? 0;
        const winnerUid = a['currentBidderUid'] as string | undefined;

        let outcome: 'sold' | 'reserve_not_met' | 'no_bids';
        if (currentBid <= 0 || !winnerUid) {
          outcome = 'no_bids';
        } else if (reservePrice !== undefined && currentBid < reservePrice) {
          outcome = 'reserve_not_met';
        } else {
          outcome = 'sold';
        }

        if (outcome === 'sold' && winnerUid) {
          closeAuctionAsSold(tx, {
            auctionRef: doc.ref,
            vehicleRef: vehicleRef && vehicleSnap?.exists ? vehicleRef : null,
            winnerUid,
            finalPrice: currentBid,
            depositPercent,
            deadlineHours,
            nowMs: now,
          });
        } else {
          tx.update(doc.ref, {
            status: 'ended',
            outcome,
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (vehicleRef && vehicleSnap?.exists) {
            tx.update(vehicleRef, {
              status: 'ready',
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
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
    } catch (err) {
      console.error('[tickAuctions] failed to close auction (non-fatal)', doc.id, err);
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
      try {
        const forfeited = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(eDoc.ref);
          if (!fresh.exists) return null;
          const a = fresh.data()!;
          // Re-check inside the transaction: an admin may have confirmed the
          // deposit (paymentStatus → 'paid') between the batch query above and
          // now. Without this guard the sweep would clobber a paid sale back
          // to 'forfeited' and re-list a car that was sold and paid for.
          if (a['paymentStatus'] !== 'pending_payment') return null;

          const vehicleId = a['vehicleId'] as string | undefined;
          const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
          const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;

          tx.update(eDoc.ref, {
            paymentStatus: 'forfeited',
            paymentStatusUpdatedAt: FieldValue.serverTimestamp(),
            paymentStatusUpdatedBy: 'system',
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (vehicleRef && vehicleSnap?.exists) {
            tx.update(vehicleRef, {
              status: 'ready',
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          return true;
        });

        if (forfeited) {
          await writeAuditLog({
            actorUid: 'system',
            action: 'auction.forfeited',
            resourceType: 'auction',
            resourceId: eDoc.id,
            after: { reason: 'payment_deadline_expired' },
          });
        }
      } catch (err) {
        console.error('[tickAuctions] forfeit of one auction failed (non-fatal)', eDoc.id, err);
      }
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
