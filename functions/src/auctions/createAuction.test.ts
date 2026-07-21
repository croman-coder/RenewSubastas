import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { createAuctionHandler } from './createAuction.js';
import { FieldValue } from 'firebase-admin/firestore';

function asStaff(uid = 'staff-uid', data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asBuyer(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'buyer-uid', token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  const collections = ['vehicles', 'auctions', 'audit_logs'];
  for (const c of collections) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedVehicle(uid: string, status: 'draft' | 'ready' = 'ready'): Promise<string> {
  const ref = adminDb().collection('vehicles').doc();
  await ref.set({
    id: ref.id,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    transmission: 'automatic',
    fuelType: 'gasoline',
    condition: 'used',
    description: { es: 'test' },
    images: [],
    status,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

describe('createAuction', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('rejects buyer', async () => {
    const vehicleId = await seedVehicle('staff-1', 'ready');
    await expect(
      createAuctionHandler(
        asBuyer({
          vehicleId,
          startingPrice: 5000,
          bidIncrement: 500,
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when endsAt is not at least 1 minute after startsAt', async () => {
    const vehicleId = await seedVehicle('staff-1', 'ready');
    const start = new Date(Date.now() + 60_000).toISOString();
    await expect(
      createAuctionHandler(
        asStaff('staff-1', {
          vehicleId,
          startingPrice: 5000,
          bidIncrement: 500,
          startsAt: start,
          endsAt: start, // same instant — invalid
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects when reservePrice is below startingPrice', async () => {
    const vehicleId = await seedVehicle('staff-1', 'ready');
    await expect(
      createAuctionHandler(
        asStaff('staff-1', {
          vehicleId,
          startingPrice: 5000,
          reservePrice: 4000,
          bidIncrement: 500,
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects when vehicle does not exist', async () => {
    await expect(
      createAuctionHandler(
        asStaff('staff-1', {
          vehicleId: 'ghost',
          startingPrice: 5000,
          bidIncrement: 500,
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when vehicle is not in ready status', async () => {
    const vehicleId = await seedVehicle('staff-1', 'draft');
    await expect(
      createAuctionHandler(
        asStaff('staff-1', {
          vehicleId,
          startingPrice: 5000,
          bidIncrement: 500,
          startsAt: new Date(Date.now() + 60_000).toISOString(),
          endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('creates auction, flips vehicle status, writes audit log; status=live when startsAt past', async () => {
    const vehicleId = await seedVehicle('staff-1', 'ready');
    const result = await createAuctionHandler(
      asStaff('staff-1', {
        vehicleId,
        startingPrice: 5000,
        reservePrice: 6000,
        bidIncrement: 500,
        startsAt: new Date(Date.now() - 60_000).toISOString(), // past
        endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      }),
    );
    expect(result.auctionId).toBeTypeOf('string');

    const auctionDoc = await adminDb().doc(`auctions/${result.auctionId}`).get();
    expect(auctionDoc.data()?.['status']).toBe('live');
    expect(auctionDoc.data()?.['startingPrice']).toBe(5000);
    expect(auctionDoc.data()?.['reservePrice']).toBe(6000);

    const vehicleDoc = await adminDb().doc(`vehicles/${vehicleId}`).get();
    expect(vehicleDoc.data()?.['status']).toBe('in_auction');

    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.create')
      .get();
    expect(logs.size).toBe(1);
  });

  it('stamps vehicle.firstListedAt on the FIRST auction only', async () => {
    const vehicleId = await seedVehicle('staff-1', 'ready');
    await createAuctionHandler(
      asStaff('staff-1', {
        vehicleId,
        startingPrice: 5000,
        bidIncrement: 500,
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      }),
    );
    const v1 = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data()!;
    expect(v1['firstListedAt']).toBeTruthy();
    const stamped = v1['firstListedAt'];

    // Re-list: put it back to ready, create a second auction — stamp must NOT move.
    await adminDb().doc(`vehicles/${vehicleId}`).update({ status: 'ready' });
    await createAuctionHandler(
      asStaff('staff-1', {
        vehicleId,
        startingPrice: 5000,
        bidIncrement: 500,
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      }),
    );
    const v2 = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data()!;
    expect(v2['firstListedAt']).toEqual(stamped);
  });
});
