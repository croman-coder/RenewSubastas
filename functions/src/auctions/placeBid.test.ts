import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { placeBidHandler } from './placeBid.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

function asBuyer(uid: string, data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asStaff(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'rate_limits', 'users']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedBuyerNoDoc(uid: string) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email: `${uid}@example.com`,
      status: 'active',
      profile: { firstName: 'Ana', lastName: 'Gomez', audience: 'retail' },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'self:google',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

async function seedBuyer(uid: string, firstName = 'Juan', lastName = 'Perez') {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email: `${uid}@example.com`,
      status: 'active',
      profile: { firstName, lastName, documentType: 'CI', documentNumber: '1234567' },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'bootstrap',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

interface SeedAuctionOpts {
  status?: 'scheduled' | 'live' | 'ended';
  endsInMs?: number;
  startingPrice?: number;
  bidIncrement?: number;
  currentBid?: number;
  currentBidderUid?: string;
}

async function seedAuction(opts: SeedAuctionOpts = {}): Promise<string> {
  const ref = adminDb().collection('auctions').doc();
  const status = opts.status ?? 'live';
  const endsInMs = opts.endsInMs ?? 60 * 60_000;
  await ref.set({
    id: ref.id,
    vehicleId: 'v1',
    vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
    startingPrice: opts.startingPrice ?? 5000,
    bidIncrement: opts.bidIncrement ?? 500,
    startsAt: Timestamp.fromMillis(Date.now() - 60_000),
    endsAt: Timestamp.fromMillis(Date.now() + endsInMs),
    currentBid: opts.currentBid ?? 0,
    ...(opts.currentBidderUid && { currentBidderUid: opts.currentBidderUid }),
    bidCount: opts.currentBid ? 1 : 0,
    status,
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

describe('placeBid', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('rejects a bid when the buyer has no document (profile incomplete)', async () => {
    await seedBuyerNoDoc('nb1');
    const auctionId = await seedAuction({ status: 'live' });
    await expect(
      placeBidHandler(asBuyer('nb1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects unauthenticated', async () => {
    const auctionId = await seedAuction();
    await expect(
      placeBidHandler({
        rawRequest: {} as never,
        data: { auctionId, amount: 5000 },
      } as CallableRequest),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects staff (non-buyer/admin)', async () => {
    const auctionId = await seedAuction();
    await expect(placeBidHandler(asStaff({ auctionId, amount: 5000 }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when auction is not live', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ status: 'scheduled' });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when auction has ended (endsAt past)', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ endsInMs: -1000 });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when amount below starting price (first bid)', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({ startingPrice: 5000 });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 4500 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when amount below currentBid + increment', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({
      startingPrice: 5000,
      bidIncrement: 500,
      currentBid: 6000,
      currentBidderUid: 'other-buyer',
    });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 6300 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects self-outbid', async () => {
    await seedBuyer('buyer-1');
    const auctionId = await seedAuction({
      currentBid: 6000,
      currentBidderUid: 'buyer-1',
    });
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 7000 })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('places valid bid; updates auction; writes bid doc', async () => {
    await seedBuyer('buyer-1', 'Juan', 'Perez');
    const auctionId = await seedAuction({ startingPrice: 5000, bidIncrement: 500 });
    const result = await placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 }));
    expect(result.newCurrentBid).toBe(5000);

    const aDoc = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(aDoc.data()?.['currentBid']).toBe(5000);
    expect(aDoc.data()?.['currentBidderUid']).toBe('buyer-1');
    expect(aDoc.data()?.['bidCount']).toBe(1);

    const bidsSnap = await adminDb().collection(`auctions/${auctionId}/bids`).get();
    expect(bidsSnap.size).toBe(1);
    const bid = bidsSnap.docs[0]!.data();
    expect(bid['amount']).toBe(5000);
    expect(bid['status']).toBe('winning');
    expect(bid['buyerSnapshot'].firstName).toBe('Juan');
    expect(bid['buyerSnapshot'].lastInitial).toBe('P');
  });

  it('extends endsAt by anti-sniping window when bid lands in last 60s', async () => {
    await seedBuyer('buyer-1');
    // endsAt = now + 30s (inside the 60s window)
    const auctionId = await seedAuction({ endsInMs: 30_000 });
    const beforeEnds = (await adminDb().doc(`auctions/${auctionId}`).get()).data()![
      'endsAt'
    ] as Timestamp;
    const result = await placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 }));
    // Must have extended beyond the original endsAt
    expect(result.endsAtMs).toBeGreaterThan(beforeEnds.toMillis());
    // And to roughly now + 60s
    expect(result.endsAtMs - Date.now()).toBeGreaterThan(50_000);
    // Cross-check: Firestore doc endsAt must match result.endsAtMs
    const aDoc = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(aDoc.data()!['endsAt'].toMillis()).toBe(result.endsAtMs);
  });

  it('rate-limits at 10 bids/minute', async () => {
    await seedBuyer('buyer-1');
    // Pre-seed rate limit doc with 10 recent timestamps
    const now = Date.now();
    await adminDb()
      .doc('rate_limits/bids_buyer-1')
      .set({
        timestamps: Array.from({ length: 10 }, (_, i) => now - i * 1000),
      });
    const auctionId = await seedAuction();
    await expect(
      placeBidHandler(asBuyer('buyer-1', { auctionId, amount: 5000 })),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('marks previous winning bid as outbid when a new bid wins', async () => {
    await seedBuyer('buyer-a');
    await seedBuyer('buyer-b');
    const auctionId = await seedAuction({ startingPrice: 5000, bidIncrement: 500 });
    await placeBidHandler(asBuyer('buyer-a', { auctionId, amount: 5000 }));
    await placeBidHandler(asBuyer('buyer-b', { auctionId, amount: 5500 }));
    const bidsSnap = await adminDb()
      .collection(`auctions/${auctionId}/bids`)
      .orderBy('amount', 'asc')
      .get();
    expect(bidsSnap.size).toBe(2);
    expect(bidsSnap.docs[0]!.data()['status']).toBe('outbid');
    expect(bidsSnap.docs[1]!.data()['status']).toBe('winning');
  });
});
