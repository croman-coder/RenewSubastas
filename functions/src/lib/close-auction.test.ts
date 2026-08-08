import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin.js';
import { closeAuctionAsSold } from './close-auction.js';

async function clearAll() {
  for (const c of ['auctions', 'vehicles']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('closeAuctionAsSold', () => {
  beforeEach(clearAll);

  it('escribe estado, ganador y los campos de dinero con el redondeo correcto', async () => {
    const db = adminDb();
    const aRef = db.doc('auctions/a1');
    const vRef = db.doc('vehicles/v1');
    await aRef.set({ status: 'live', currentBid: 0 });
    await vRef.set({ status: 'in_auction' });

    const now = 1_800_000_000_000;
    await db.runTransaction(async (tx) => {
      await tx.get(aRef);
      await tx.get(vRef);
      closeAuctionAsSold(tx, {
        auctionRef: aRef,
        vehicleRef: vRef,
        winnerUid: 'buyer-1',
        // 33333.33 * 0.1 = 3333.333 -> debe redondear a 3333.33
        finalPrice: 33333.33,
        depositPercent: 0.1,
        deadlineHours: 24,
        nowMs: now,
      });
    });

    const a = (await aRef.get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold');
    expect(a['winnerUid']).toBe('buyer-1');
    expect(a['finalPrice']).toBe(33333.33);
    expect(a['paymentStatus']).toBe('pending_payment');
    expect(a['paymentDepositPercent']).toBe(0.1);
    expect(a['paymentDepositUsd']).toBe(3333.33);
    expect((a['paymentDeadline'] as Timestamp).toMillis()).toBe(now + 24 * 3600_000);
    expect((await vRef.get()).data()!['status']).toBe('sold');
  });

  it('tolera una subasta sin vehículo asociado', async () => {
    const db = adminDb();
    const aRef = db.doc('auctions/a2');
    await aRef.set({ status: 'live' });
    await db.runTransaction(async (tx) => {
      await tx.get(aRef);
      closeAuctionAsSold(tx, {
        auctionRef: aRef,
        vehicleRef: null,
        winnerUid: 'b',
        finalPrice: 1000,
        depositPercent: 0.1,
        deadlineHours: 24,
        nowMs: 1_800_000_000_000,
      });
    });
    expect((await aRef.get()).data()!['outcome']).toBe('sold');
  });
});
