import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { buyNowHandler } from './buyNow.js';

const AUCTION = 'a1';
const BUYER = 'buyer-1';

// expectedPrice defaults to seed()'s buyNowPrice (34000) so every existing
// call site below keeps working unchanged; tests covering the mismatch
// itself override it explicitly.
function asBuyer(uid = BUYER, audience = 'retail', data: Record<string, unknown> = {}) {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active', audience } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, expectedPrice: 34000, ...data },
  } as CallableRequest;
}

// Blocking 4 root-cause investigation: this was suspected as sequential
// per-collection processing widening the window in which a slow/loaded
// emulator could delay beforeEach past what the next test expects. Running
// the 4 collections concurrently (they're independent — no ordering
// requirement between them) shrinks that window. Confirmed by direct
// measurement NOT to be the actual mechanism behind the flake (see the
// task-11 fix report), but it's a legitimate speed-up with no downside, so
// it stays.
async function clearAll() {
  await Promise.all(
    ['auctions', 'users', 'vehicles', 'rate_limits'].map(async (c) => {
      const docs = await adminDb().collection(c).listDocuments();
      await Promise.all(
        docs.map(async (d) => {
          const [bids, priv] = await Promise.all([
            d.collection('bids').listDocuments(),
            d.collection('private').listDocuments(),
          ]);
          await Promise.all([...bids, ...priv].map((s) => s.delete()));
          await d.delete();
        }),
      );
    }),
  );
}

async function seed(overrides: Record<string, unknown> = {}) {
  // The three docs below are independent of each other (different
  // collections, no data dependency) — same reasoning as clearAll() above.
  await Promise.all([
    adminDb()
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
      }),
    adminDb().doc('vehicles/v1').set({ status: 'in_auction' }),
    adminDb()
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
      }),
  ]);
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
    // Same transaction issues a second tx.update() on this same doc (the one
    // in buyNow.ts itself, disjoint from closeAuctionAsSold's fields) — cover
    // both write sets in one test so a future regression where one clobbers
    // the other can't hide behind two tests that each only check their half.
    expect(a['currentBid']).toBe(34000);
    expect(a['bidCount']).toBe(1);
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

  // Blocking 1: the confirm dialog shows whatever buyNowPrice the buyer's
  // client last saw; staff can edit it (even on a live auction — see
  // updateAuction.ts) between that render and this call. Without this check
  // the transaction would silently close at the NEW stored price while the
  // buyer only ever confirmed the old one.
  it('rechaza si el precio esperado ya no coincide con el actual', async () => {
    await expect(
      buyNowHandler(asBuyer(BUYER, 'retail', { expectedPrice: 99999 })),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'El precio de Compra ya cambió respecto al que ves en pantalla.',
    });
    // No partial write: a rejected mismatch must leave the auction exactly
    // as it was, not half-closed.
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['status']).toBe('live');
    expect(a['outcome']).toBeUndefined();
    expect(a['bidCount']).toBe(0);
  });

  it('rechaza sin expectedPrice — campo obligatorio, no hay más que un llamador', async () => {
    await expect(
      buyNowHandler({
        auth: {
          uid: BUYER,
          token: { role: 'buyer', status: 'active', audience: 'retail' } as never,
        },
        rawRequest: {} as never,
        data: { auctionId: AUCTION },
      } as CallableRequest),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rechaza un auctionId con separadores de path', async () => {
    await expect(
      buyNowHandler(asBuyer(BUYER, 'retail', { auctionId: 'a1/bids/x' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // Deliberately does NOT use the shared AUCTION/BUYER fixtures the rest of
  // this file reuses — its own auction + buyer ids that no other test here
  // ever touches, so it can never be perturbed by anything left over from an
  // earlier test regardless of cause. This was the leading hypothesis for
  // the historical flake (state carry-over in clearAll()/seed()); direct
  // measurement (task-11 fix report) shows it is NOT the actual mechanism —
  // an isolated repro harness with no vitest, no beforeEach and no shared
  // ids at all reproduces the same anomaly under heavy CPU contention, at
  // close to the originally-reported rate. The isolation stays anyway as
  // legitimate, zero-downside hardening; it just isn't the fix.
  //
  // The real, reproduced mechanism: under heavy CPU contention, a losing
  // transaction's SDK-driven retry (triggered by Firestore detecting the
  // winner's commit) can observe a false `not-found` for a document that was
  // never deleted — most likely a local-emulator artifact under extreme
  // scheduling delay, though buyNow can also see a GENUINE not-found in
  // production via deleteAuction.ts, which is not transactional and can
  // delete a live/zero-bid auction (the exact state Compra ya requires) at
  // the same instant a buyNow call is in flight. Either way the loser must
  // still fail cleanly with a code buy-now-error.ts maps honestly — see its
  // not-found branch — rather than this test papering over a wrong result.
  it('bajo compras concurrentes exactamente una gana', async () => {
    const RACE_AUCTION = 'race-a1';
    const buyers = ['race-buyer-1', 'race-buyer-2'];

    await Promise.all([
      adminDb()
        .doc(`auctions/${RACE_AUCTION}`)
        .set({
          vehicleId: 'race-v1',
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
        }),
      adminDb()
        .doc(`users/${buyers[0]}`)
        .set({
          email: 'race1@example.com',
          profile: {
            firstName: 'Juan',
            lastName: 'Pérez',
            audience: 'retail',
            documentType: 'CI',
            documentNumber: '1234567',
          },
        }),
      adminDb()
        .doc(`users/${buyers[1]}`)
        .set({
          email: 'race2@example.com',
          profile: {
            firstName: 'Ana',
            lastName: 'Gómez',
            audience: 'retail',
            documentType: 'CI',
            documentNumber: '7654321',
          },
        }),
    ]);

    function asRaceBuyer(uid: string) {
      return {
        auth: { uid, token: { role: 'buyer', status: 'active', audience: 'retail' } as never },
        rawRequest: {} as never,
        data: { auctionId: RACE_AUCTION, expectedPrice: 34000 },
      } as CallableRequest;
    }

    // Order matches buyers[], so results[i] is the outcome for buyers[i] —
    // lets us find out which of the two actually won without assuming it's
    // always buyers[0] (the race can go either way).
    const results = await Promise.allSettled(buyers.map((uid) => buyNowHandler(asRaceBuyer(uid))));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser must fail *cleanly* — a generic/unhandled error or a
    // resource-exhausted from the rate limiter would pass an "only one
    // fulfilled" check just as well, but would mean the retry saw something
    // other than the re-asserted precondition (already sold / already bid).
    expect(rejected[0]!.reason).toMatchObject({ code: 'failed-precondition' });

    const winnerUid = buyers[results.findIndex((r) => r.status === 'fulfilled')]!;
    const a = (await adminDb().doc(`auctions/${RACE_AUCTION}`).get()).data()!;
    expect(a['bidCount']).toBe(1);
    expect(a['winnerUid']).toBe(winnerUid);

    const bids = await adminDb().collection(`auctions/${RACE_AUCTION}/bids`).get();
    expect(bids.size).toBe(1);
  });
});
