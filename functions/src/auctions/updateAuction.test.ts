import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { updateAuctionHandler } from './updateAuction.js';

function asStaff(data: Record<string, unknown>): CallableRequest {
  return {
    auth: { uid: 'staff-1', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        for (const sub of ['priceChanges', 'private']) {
          const subDocs = await d.collection(sub).listDocuments();
          await Promise.all(subDocs.map((s) => s.delete()));
        }
        await d.delete();
      }),
    );
  }
}

async function seedScheduledAuction(id = 'a1', startingPrice = 10000) {
  await adminDb()
    .doc(`auctions/${id}`)
    .set({
      id,
      vehicleId: 'v1',
      status: 'scheduled',
      startingPrice,
      bidIncrement: 100,
      startsAt: Timestamp.fromMillis(Date.now() + 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + 7200_000),
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function seedLiveAuction(id = 'l1', endsInMs = 3600_000) {
  await adminDb()
    .doc(`auctions/${id}`)
    .set({
      id,
      vehicleId: 'v1',
      status: 'live',
      startingPrice: 10000,
      bidIncrement: 100,
      startsAt: Timestamp.fromMillis(Date.now() - 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + endsInMs),
      currentBid: 10500,
      createdAt: FieldValue.serverTimestamp(),
    });
}

describe('updateAuction priceChanges', () => {
  beforeEach(clearAll);

  it('records a reduction with isReduction=true and actor name', async () => {
    await adminDb()
      .doc('users/staff-1')
      .set({
        uid: 'staff-1',
        role: 'staff',
        status: 'active',
        email: 'staff@santarosa.com.py',
        profile: { firstName: 'Sofia', lastName: 'Rios' },
      });
    await seedScheduledAuction('a1', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'a1', startingPrice: 9000 }));

    const changes = await adminDb().collection('auctions/a1/priceChanges').get();
    expect(changes.size).toBe(1);
    const c = changes.docs[0]!.data();
    expect(c['field']).toBe('startingPrice');
    expect(c['from']).toBe(10000);
    expect(c['to']).toBe(9000);
    expect(c['isReduction']).toBe(true);
    expect(c['actorUid']).toBe('staff-1');
    expect(c['actorName']).toContain('Sofia');
  });

  it('records an increase with isReduction=false and none when price untouched', async () => {
    await seedScheduledAuction('a2', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'a2', startingPrice: 12000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'a2', bidIncrement: 250 }));

    const changes = await adminDb().collection('auctions/a2/priceChanges').get();
    expect(changes.size).toBe(1);
    expect(changes.docs[0]!.data()['isReduction']).toBe(false);
  });
});

describe('updateAuction reservePrice (private/internal, never the parent doc)', () => {
  beforeEach(clearAll);

  it('setting a reserve on a scheduled auction writes it to private/internal, not the parent', async () => {
    await seedScheduledAuction('r1', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'r1', reservePrice: 11000 }));

    const parent = await adminDb().doc('auctions/r1').get();
    expect(parent.data()?.['reservePrice']).toBeUndefined();
    const priv = await adminDb().doc('auctions/r1/private/internal').get();
    expect(priv.data()?.['reservePrice']).toBe(11000);
  });

  it('clearing a reserve (null) removes it from private/internal', async () => {
    await seedScheduledAuction('r2', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'r2', reservePrice: 11000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'r2', reservePrice: null }));

    const priv = await adminDb().doc('auctions/r2/private/internal').get();
    expect(priv.data()?.['reservePrice']).toBeUndefined();
  });

  it('rejects a reserve below the (possibly just-updated) startingPrice, reading the current reserve from private/internal', async () => {
    await seedScheduledAuction('r3', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'r3', reservePrice: 15000 }));
    // Now raise startingPrice above the existing private reserve — must be
    // rejected using the CURRENT reserve (read from private/internal), not
    // a stale/absent value from the parent doc.
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'r3', startingPrice: 16000 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('a reserve change also lands in priceChanges with the correct from/to', async () => {
    await seedScheduledAuction('r4', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'r4', reservePrice: 12000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'r4', reservePrice: 11000 }));

    const changes = await adminDb()
      .collection('auctions/r4/priceChanges')
      .where('field', '==', 'reservePrice')
      .get();
    expect(changes.size).toBe(2);
    const second = changes.docs.find((d) => d.data()['to'] === 11000)!;
    expect(second.data()['from']).toBe(12000);
    expect(second.data()['isReduction']).toBe(true);
  });
});

describe('updateAuction live-status extend + hardEndsAt', () => {
  beforeEach(clearAll);

  it('extends endsAt on a live auction and refreshes hardEndsAt from the new end time', async () => {
    await seedLiveAuction('l1', 3600_000);
    const newEnd = new Date(Date.now() + 7200_000).toISOString();
    await updateAuctionHandler(asStaff({ auctionId: 'l1', endsAt: newEnd }));

    const a = (await adminDb().doc('auctions/l1').get()).data()!;
    expect(a['endsAt'].toMillis()).toBe(new Date(newEnd).getTime());
    // hardEndsAt must be refreshed to (new endsAt + 30min), not left stale.
    expect(a['hardEndsAt'].toMillis()).toBe(new Date(newEnd).getTime() + 30 * 60_000);
  });

  it('rejects a price edit on a live auction', async () => {
    await seedLiveAuction('l2');
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'l2', startingPrice: 20000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects shortening endsAt on a live auction', async () => {
    await seedLiveAuction('l3', 3600_000);
    const earlier = new Date(Date.now() + 1000).toISOString();
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'l3', endsAt: earlier })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects editing an ended auction', async () => {
    await adminDb()
      .doc('auctions/l4')
      .set({
        id: 'l4',
        vehicleId: 'v1',
        status: 'ended',
        startingPrice: 10000,
        bidIncrement: 100,
        startsAt: Timestamp.fromMillis(Date.now() - 7200_000),
        endsAt: Timestamp.fromMillis(Date.now() - 3600_000),
        createdAt: FieldValue.serverTimestamp(),
      });
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'l4', startingPrice: 9000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('updateAuction buyNowPrice validation', () => {
  beforeEach(clearAll);

  it('rechaza buyNowPrice menor o igual a la reserva', async () => {
    await seedScheduledAuction('b1', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'b1', reservePrice: 30000 }));
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'b1', buyNowPrice: 30000 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      updateAuctionHandler(asStaff({ auctionId: 'b1', buyNowPrice: 29000 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('acepta buyNowPrice mayor a la reserva', async () => {
    await seedScheduledAuction('b2', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'b2', reservePrice: 30000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'b2', buyNowPrice: 34000 }));
    const a = (await adminDb().doc('auctions/b2').get()).data()!;
    expect(a['buyNowPrice']).toBe(34000);
  });

  it('permite limpiar buyNowPrice con null', async () => {
    await seedScheduledAuction('b3', 10000);
    await updateAuctionHandler(asStaff({ auctionId: 'b3', reservePrice: 30000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'b3', buyNowPrice: 34000 }));
    await updateAuctionHandler(asStaff({ auctionId: 'b3', buyNowPrice: null }));
    const a = (await adminDb().doc('auctions/b3').get()).data()!;
    expect(a['buyNowPrice']).toBeUndefined();
  });
});
