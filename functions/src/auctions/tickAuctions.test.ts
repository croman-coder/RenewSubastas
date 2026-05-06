import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from '../lib/admin.js';
import { runTickAuctions } from './tickAuctions.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

async function clearAll() {
  for (const c of ['auctions', 'vehicles', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

interface SeedAuctionOpts {
  status: 'scheduled' | 'live' | 'ended';
  startsInMs: number;
  endsInMs: number;
  startingPrice?: number;
  currentBid?: number;
  currentBidderUid?: string;
  reservePrice?: number;
}

async function seedAuctionAndVehicle(
  opts: SeedAuctionOpts,
): Promise<{ auctionId: string; vehicleId: string }> {
  const vRef = adminDb().collection('vehicles').doc();
  await vRef.set({
    id: vRef.id,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    transmission: 'automatic',
    fuelType: 'gasoline',
    condition: 'used',
    description: { es: 'test' },
    images: [],
    status: opts.status === 'scheduled' ? 'in_auction' : 'in_auction',
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const aRef = adminDb().collection('auctions').doc();
  await aRef.set({
    id: aRef.id,
    vehicleId: vRef.id,
    vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
    startingPrice: opts.startingPrice ?? 5000,
    bidIncrement: 500,
    startsAt: Timestamp.fromMillis(Date.now() + opts.startsInMs),
    endsAt: Timestamp.fromMillis(Date.now() + opts.endsInMs),
    currentBid: opts.currentBid ?? 0,
    ...(opts.currentBidderUid && { currentBidderUid: opts.currentBidderUid }),
    ...(opts.reservePrice !== undefined && { reservePrice: opts.reservePrice }),
    bidCount: opts.currentBid ? 1 : 0,
    status: opts.status,
    createdBy: 'staff-1',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { auctionId: aRef.id, vehicleId: vRef.id };
}

describe('runTickAuctions', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('promotes scheduled to live when startsAt is past', async () => {
    const { auctionId } = await seedAuctionAndVehicle({
      status: 'scheduled',
      startsInMs: -60_000,
      endsInMs: 24 * 3600_000,
    });
    const r = await runTickAuctions();
    expect(r.promoted).toBe(1);
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['status']).toBe('live');
  });

  it('does not promote scheduled with future startsAt', async () => {
    await seedAuctionAndVehicle({
      status: 'scheduled',
      startsInMs: 60_000,
      endsInMs: 24 * 3600_000,
    });
    const r = await runTickAuctions();
    expect(r.promoted).toBe(0);
  });

  it('closes live with no bids → outcome=no_bids, vehicle=ready', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
    });
    const r = await runTickAuctions();
    expect(r.closed).toBe(1);
    expect(r.details[0]?.outcome).toBe('no_bids');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['status']).toBe('ended');
    expect(a.data()?.['outcome']).toBe('no_bids');
    expect(a.data()?.['winnerUid']).toBeUndefined();
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('ready');
  });

  it('closes live with bid >= reserve → outcome=sold', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      startingPrice: 5000,
      reservePrice: 6000,
      currentBid: 7000,
      currentBidderUid: 'buyer-winner',
    });
    const r = await runTickAuctions();
    expect(r.details[0]?.outcome).toBe('sold');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['outcome']).toBe('sold');
    expect(a.data()?.['winnerUid']).toBe('buyer-winner');
    expect(a.data()?.['finalPrice']).toBe(7000);
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('sold');
  });

  it('closes live with bid below reserve → outcome=reserve_not_met, vehicle=ready', async () => {
    const { auctionId, vehicleId } = await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      startingPrice: 5000,
      reservePrice: 8000,
      currentBid: 6000,
      currentBidderUid: 'buyer-loser',
    });
    const r = await runTickAuctions();
    expect(r.details[0]?.outcome).toBe('reserve_not_met');
    const a = await adminDb().doc(`auctions/${auctionId}`).get();
    expect(a.data()?.['winnerUid']).toBeUndefined();
    expect(a.data()?.['finalPrice']).toBeUndefined();
    const v = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(v.data()?.['status']).toBe('ready');
  });

  it('writes audit log per closure', async () => {
    await seedAuctionAndVehicle({
      status: 'live',
      startsInMs: -2 * 3600_000,
      endsInMs: -1000,
      currentBid: 8000,
      currentBidderUid: 'buyer-1',
    });
    await runTickAuctions();
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.close')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('system');
  });
});
