import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { buyNowHandler } from './buyNow.js';

const AUCTION = 'a1';
const BUYER = 'buyer-1';

function asBuyer(uid = BUYER, audience = 'retail', data: Record<string, unknown> = {}) {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active', audience } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, ...data },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'vehicles', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(
      docs.map(async (d) => {
        const subs = await d.collection('bids').listDocuments();
        await Promise.all(subs.map((s) => s.delete()));
        await d.delete();
      }),
    );
  }
}

async function seed(overrides: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`auctions/${AUCTION}`)
    .set({
      vehicleId: 'v1',
      audience: 'retail',
      status: 'live',
      startingPrice: 25000,
      buyNowPrice: 34000,
      bidIncrement: 500,
      currentBid: 0,
      bidCount: 0,
      startsAt: Timestamp.fromMillis(Date.now() - 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000),
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
      ...overrides,
    });
  await adminDb().doc('vehicles/v1').set({ status: 'in_auction' });
  await adminDb()
    .doc(`users/${BUYER}`)
    .set({
      email: 'b@example.com',
      profile: {
        firstName: 'Juan',
        lastName: 'Pérez',
        audience: 'retail',
        documentType: 'CI',
        documentNumber: '1234567',
      },
    });
}

describe('buyNow', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
  });

  it('cierra la subasta como vendida al precio de Compra ya', async () => {
    const res = await buyNowHandler(asBuyer());
    expect(res).toEqual({ ok: true, finalPrice: 34000 });

    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold');
    expect(a['winnerUid']).toBe(BUYER);
    expect(a['finalPrice']).toBe(34000);
    expect(a['paymentStatus']).toBe('pending_payment');
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('sold');
  });

  it('registra la compra en el historial de pujas', async () => {
    await buyNowHandler(asBuyer());
    const bids = await adminDb().collection(`auctions/${AUCTION}/bids`).get();
    expect(bids.size).toBe(1);
    expect(bids.docs[0]!.data()).toMatchObject({
      buyerUid: BUYER,
      amount: 34000,
      status: 'winning',
      source: 'buy_now',
    });
  });

  it('rechaza cuando ya hay pujas', async () => {
    await seed({ bidCount: 1, currentBid: 25500 });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza si la subasta no está live', async () => {
    await seed({ status: 'scheduled' });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza si ya venció', async () => {
    await seed({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza a un comprador de otra audiencia', async () => {
    await expect(buyNowHandler(asBuyer(BUYER, 'wholesale'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rechaza si la subasta no tiene precio de Compra ya', async () => {
    const ref = adminDb().doc(`auctions/${AUCTION}`);
    const { buyNowPrice: _omit, ...rest } = (await ref.get()).data()!;
    await ref.set(rest);
    await expect(buyNowHandler(asBuyer())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza un auctionId con separadores de path', async () => {
    await expect(
      buyNowHandler(asBuyer(BUYER, 'retail', { auctionId: 'a1/bids/x' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('bajo compras concurrentes exactamente una gana', async () => {
    await adminDb()
      .doc('users/buyer-2')
      .set({
        email: 'b2@example.com',
        profile: {
          firstName: 'Ana',
          lastName: 'Gómez',
          audience: 'retail',
          documentType: 'CI',
          documentNumber: '7654321',
        },
      });
    const [r1, r2] = await Promise.allSettled([
      buyNowHandler(asBuyer(BUYER)),
      buyNowHandler(asBuyer('buyer-2')),
    ]);
    const ok = [r1, r2].filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['bidCount']).toBe(1);
  });
});
