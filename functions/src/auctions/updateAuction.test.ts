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
        const sub = await d.collection('priceChanges').listDocuments();
        await Promise.all(sub.map((s) => s.delete()));
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
