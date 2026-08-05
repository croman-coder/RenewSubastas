import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { logAuctionViewHandler } from './logAuctionView.js';

function asBuyer(uid: string, auctionId: string, audience?: string): CallableRequest {
  return {
    auth: {
      uid,
      token: { role: 'buyer', status: 'active', ...(audience ? { audience } : {}) } as never,
    },
    rawRequest: {} as never,
    data: { auctionId },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const sub = await d.collection('viewers').listDocuments();
        await Promise.all(sub.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seedAuction(id = 'a1') {
  await adminDb()
    .doc(`auctions/${id}`)
    .set({
      id,
      vehicleId: 'v1',
      status: 'live',
      startsAt: Timestamp.now(),
      endsAt: Timestamp.fromMillis(Date.now() + 3600_000),
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function seedBuyer(uid: string) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      status: 'active',
      profile: { firstName: 'Ana', lastName: 'Gomez' },
    });
}

describe('logAuctionView', () => {
  beforeEach(clearAll);

  it('first view creates viewer doc and sets aggregates', async () => {
    await seedAuction();
    await seedBuyer('b1');
    const res = await logAuctionViewHandler(asBuyer('b1', 'a1'));
    expect(res).toEqual({ ok: true, logged: true });

    const viewer = (await adminDb().doc('auctions/a1/viewers/b1').get()).data()!;
    expect(viewer['viewCount']).toBe(1);
    expect(viewer['firstName']).toBe('Ana');
    expect(viewer['lastInitial']).toBe('G');

    const a = (await adminDb().doc('auctions/a1').get()).data()!;
    expect(a['viewStats']).toEqual({ total: 1, unique: 1 });
  });

  it('repeat view increments total + viewCount but not unique', async () => {
    await seedAuction();
    await seedBuyer('b1');
    await logAuctionViewHandler(asBuyer('b1', 'a1'));
    await logAuctionViewHandler(asBuyer('b1', 'a1'));

    const viewer = (await adminDb().doc('auctions/a1/viewers/b1').get()).data()!;
    expect(viewer['viewCount']).toBe(2);
    const a = (await adminDb().doc('auctions/a1').get()).data()!;
    expect(a['viewStats']).toEqual({ total: 2, unique: 1 });
  });

  it('staff/admin/finanzas views are a no-op', async () => {
    await seedAuction();
    for (const role of ['staff', 'admin', 'finanzas'] as const) {
      const req = {
        auth: { uid: `${role}-1`, token: { role, status: 'active' } as never },
        rawRequest: {} as never,
        data: { auctionId: 'a1' },
      } as CallableRequest;
      const res = await logAuctionViewHandler(req);
      expect(res).toEqual({ ok: true, logged: false });
    }
    const viewers = await adminDb().collection('auctions/a1/viewers').listDocuments();
    expect(viewers.length).toBe(0);
  });

  it('rejects unknown auction', async () => {
    await seedBuyer('b1');
    await expect(logAuctionViewHandler(asBuyer('b1', 'nope'))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects unauthenticated', async () => {
    const req = { rawRequest: {} as never, data: { auctionId: 'a1' } } as CallableRequest;
    await expect(logAuctionViewHandler(req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects an auctionId with path separators (injection guard)', async () => {
    await seedBuyer('b1');
    await expect(logAuctionViewHandler(asBuyer('b1', 'a1/bids/x'))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('cross-audience view is a no-op (retail buyer, wholesale auction)', async () => {
    // Regression test: this callable uses the Admin SDK and bypasses
    // Firestore rules, so nothing stopped a buyer from logging a view
    // (and polluting viewStats/viewers) for an auction outside their own
    // audience before this check existed.
    await seedAuction('a1');
    await adminDb().doc('auctions/a1').set({ audience: 'wholesale' }, { merge: true });
    await seedBuyer('b1');
    const res = await logAuctionViewHandler(asBuyer('b1', 'a1'));
    expect(res).toEqual({ ok: true, logged: false });

    const viewers = await adminDb().collection('auctions/a1/viewers').listDocuments();
    expect(viewers.length).toBe(0);
    const a = (await adminDb().doc('auctions/a1').get()).data()!;
    expect(a['viewStats']).toBeUndefined();
  });

  it('logs normally when the buyer audience matches the auction audience', async () => {
    await seedAuction('a1');
    await adminDb().doc('auctions/a1').set({ audience: 'wholesale' }, { merge: true });
    await seedBuyer('b1');
    const res = await logAuctionViewHandler(asBuyer('b1', 'a1', 'wholesale'));
    expect(res).toEqual({ ok: true, logged: true });
  });

  it('rate limits a hostile client (max 20/min)', async () => {
    await seedAuction();
    await seedBuyer('b1');
    for (let i = 0; i < 20; i++) {
      await logAuctionViewHandler(asBuyer('b1', 'a1'));
    }
    await expect(logAuctionViewHandler(asBuyer('b1', 'a1'))).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });
});
