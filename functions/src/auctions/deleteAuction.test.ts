import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { deleteAuctionHandler } from './deleteAuction.js';

const AUCTION = 'a1';

function asRole(role: string, data: Record<string, unknown> = {}) {
  return {
    auth: { uid: `${role}-uid`, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, ...data },
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'vehicles', 'audit_logs']) {
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
      status: 'scheduled',
      startingPrice: 25000,
      bidIncrement: 500,
      currentBid: 0,
      bidCount: 0,
      startsAt: Timestamp.fromMillis(Date.now() + 3600_000),
      endsAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000),
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
      ...overrides,
    });
  await adminDb().doc('vehicles/v1').set({ status: 'in_auction' });
}

describe('deleteAuction', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
  });

  // --- Blocking 2: sold auctions must never be deletable ---

  it('rechaza eliminar una subasta vendida en plataforma (outcome: sold)', async () => {
    await seed({
      status: 'ended',
      outcome: 'sold',
      winnerUid: 'buyer-1',
      finalPrice: 30000,
      paymentStatus: 'pending_payment',
    });
    await expect(deleteAuctionHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    // Must survive untouched — this is the only record of the sale.
    const snap = await adminDb().doc(`auctions/${AUCTION}`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()!['winnerUid']).toBe('buyer-1');
  });

  // Genuine regression test: fails against the pre-fix code, which checked
  // only `status === 'sold' || outcome === 'sold'` and let this exact
  // scenario through — the walkthrough reproduced it live against a real
  // sold_offline auction and got back {ok:true} with the document gone.
  it('rechaza eliminar una subasta vendida en el salón (outcome: sold_offline) — regresión', async () => {
    await seed({
      status: 'ended',
      outcome: 'sold_offline',
      soldOfflinePriceUsd: 28000,
      soldOfflineAt: Timestamp.now(),
      soldOfflineBy: 'staff-uid',
    });
    await expect(deleteAuctionHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    // The regression: soldOfflinePriceUsd/soldOfflineAt/soldOfflineBy has no
    // other home and no callable can recreate it once the doc is gone. If
    // this doc doesn't exist anymore, the bug is back.
    const snap = await adminDb().doc(`auctions/${AUCTION}`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()!['soldOfflinePriceUsd']).toBe(28000);
    expect(snap.data()!['soldOfflineBy']).toBe('staff-uid');
  });

  it('rechaza eliminar aunque status quede en un valor legacy "sold" (rama muerta pero cubierta)', async () => {
    // status never actually takes this value in current code (it's one of
    // scheduled/live/ended/cancelled), but the handler still checks for it —
    // pin the behavior so a future refactor that removes the dead branch
    // notices via a failing test instead of silently changing behavior.
    await seed({ status: 'sold' });
    await expect(deleteAuctionHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  // --- Allowed deletions ---

  it('permite eliminar una subasta programada (scheduled)', async () => {
    await expect(deleteAuctionHandler(asRole('staff'))).resolves.toEqual({ ok: true });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(false);
  });

  it('permite eliminar una subasta cancelada', async () => {
    await seed({ status: 'cancelled' });
    await expect(deleteAuctionHandler(asRole('staff'))).resolves.toEqual({ ok: true });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(false);
  });

  it('permite eliminar una subasta ended sin pujas (no_bids)', async () => {
    await seed({ status: 'ended', outcome: 'no_bids' });
    await expect(deleteAuctionHandler(asRole('staff'))).resolves.toEqual({ ok: true });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(false);
  });

  it('permite eliminar una subasta ended con reserva no alcanzada (reserve_not_met)', async () => {
    await seed({ status: 'ended', outcome: 'reserve_not_met' });
    await expect(deleteAuctionHandler(asRole('staff'))).resolves.toEqual({ ok: true });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(false);
  });

  it('permite eliminar una subasta live sin pujas', async () => {
    await seed({ status: 'live', bidCount: 0 });
    await expect(deleteAuctionHandler(asRole('staff'))).resolves.toEqual({ ok: true });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(false);
  });

  // --- Other guardrails, unaffected by this fix but part of the contract ---

  it('rechaza eliminar una subasta live con pujas', async () => {
    await seed({ status: 'live', bidCount: 1, currentBid: 25500 });
    await expect(deleteAuctionHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect((await adminDb().doc(`auctions/${AUCTION}`).get()).exists).toBe(true);
  });

  it('acepta staff y admin, rechaza buyer y finanzas', async () => {
    await expect(deleteAuctionHandler(asRole('buyer'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(deleteAuctionHandler(asRole('finanzas'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(deleteAuctionHandler(asRole('admin'))).resolves.toEqual({ ok: true });
  });

  it('rechaza sin autenticación', async () => {
    await expect(
      deleteAuctionHandler({
        rawRequest: {} as never,
        data: { auctionId: AUCTION },
      } as CallableRequest),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rechaza si la subasta no existe', async () => {
    await expect(
      deleteAuctionHandler(asRole('staff', { auctionId: 'does-not-exist' })),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rechaza un auctionId con separadores de path', async () => {
    await expect(
      deleteAuctionHandler(asRole('staff', { auctionId: 'a1/bids/x' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // --- Side effects of an allowed delete ---

  it('libera el vehículo a "ready" tras eliminar', async () => {
    await deleteAuctionHandler(asRole('staff'));
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('ready');
  });

  it('no toca el vehículo si ya no está in_auction', async () => {
    await adminDb().doc('vehicles/v1').set({ status: 'archived' });
    await deleteAuctionHandler(asRole('staff'));
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('archived');
  });

  it('borra la subcolección de bids junto con la subasta', async () => {
    await adminDb()
      .doc(`auctions/${AUCTION}/bids/b1`)
      .set({ auctionId: AUCTION, buyerUid: 'buyer-1', amount: 25500, status: 'winning' });
    await deleteAuctionHandler(asRole('staff'));
    const bids = await adminDb().collection(`auctions/${AUCTION}/bids`).get();
    expect(bids.empty).toBe(true);
  });

  it('escribe log de auditoría con el estado antes de borrar', async () => {
    await seed({ status: 'ended', outcome: 'no_bids' });
    await deleteAuctionHandler(asRole('staff'));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.delete')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()).toMatchObject({
      actorUid: 'staff-uid',
      before: { status: 'ended', outcome: 'no_bids', bidCount: 0 },
    });
  });
});
