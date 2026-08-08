import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { markSoldOfflineHandler } from './markSoldOffline.js';

const AUCTION = 'a1';

function asRole(role: string, data: Record<string, unknown> = {}) {
  return {
    auth: { uid: `${role}-uid`, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data: { auctionId: AUCTION, soldPriceUsd: 28000, ...data },
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
      status: 'live',
      currentBid: 26000,
      currentBidderUid: 'buyer-1',
      bidCount: 1,
      endsAt: Timestamp.fromMillis(Date.now() + 86400_000),
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
      ...overrides,
    });
  await adminDb().doc('vehicles/v1').set({ status: 'in_auction' });
  await adminDb()
    .doc(`auctions/${AUCTION}/bids/b1`)
    .set({ auctionId: AUCTION, buyerUid: 'buyer-1', amount: 26000, status: 'winning' });
}

describe('markSoldOffline', () => {
  beforeEach(async () => {
    await clearAll();
    await seed();
  });

  it('marca la subasta como vendida fuera de plataforma', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['status']).toBe('ended');
    expect(a['outcome']).toBe('sold_offline');
    expect(a['soldOfflinePriceUsd']).toBe(28000);
    expect(a['soldOfflineBy']).toBe('staff-uid');
    expect(a['soldOfflineAt']).toBeDefined();
    expect((await adminDb().doc('vehicles/v1').get()).data()!['status']).toBe('sold');
  });

  it('NO escribe ganador ni campos de pago', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['winnerUid']).toBeUndefined();
    expect(a['finalPrice']).toBeUndefined();
    expect(a['paymentStatus']).toBeUndefined();
    expect(a['paymentDeadline']).toBeUndefined();
  });

  it('marca las pujas activas como outbid', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const bids = await adminDb().collection(`auctions/${AUCTION}/bids`).get();
    expect(bids.docs.every((d) => d.data()['status'] === 'outbid')).toBe(true);
  });

  // The displaced bidder must stop reading as "the top bidder" everywhere
  // that field is checked without also checking outcome — e.g. bid-panel.tsx's
  // isWinning = currentBidderUid === myUid && currentBid > 0, which for an
  // ended auction becomes "you won". currentBid itself is a historical fact
  // (the high bid when the unit was pulled) and must survive untouched.
  it('borra currentBidderUid pero conserva currentBid', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const a = (await adminDb().doc(`auctions/${AUCTION}`).get()).data()!;
    expect(a['currentBidderUid']).toBeUndefined();
    expect(a['currentBid']).toBe(26000);
  });

  it('acepta staff y admin, rechaza buyer y finanzas', async () => {
    await markSoldOfflineHandler(asRole('admin'));
    await clearAll();
    await seed();
    await markSoldOfflineHandler(asRole('staff'));
    await clearAll();
    await seed();
    await expect(markSoldOfflineHandler(asRole('buyer'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(markSoldOfflineHandler(asRole('finanzas'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rechaza sin autenticación', async () => {
    await expect(
      markSoldOfflineHandler({
        rawRequest: {} as never,
        data: { auctionId: AUCTION, soldPriceUsd: 28000 },
      } as CallableRequest),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rechaza si la subasta ya está cerrada', async () => {
    await seed({ status: 'ended', outcome: 'sold' });
    await expect(markSoldOfflineHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  // Distinct from the case above: the literal double-marking scenario (staff
  // tries to mark it sold_offline again) rather than "already sold on
  // platform". Same status check, same rejection, but the brief only named
  // the sold/sold_offline pair — pin both halves of it explicitly.
  it('rechaza si ya fue marcada sold_offline', async () => {
    await seed({ status: 'ended', outcome: 'sold_offline' });
    await expect(markSoldOfflineHandler(asRole('staff'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechaza un precio no positivo', async () => {
    await expect(
      markSoldOfflineHandler(asRole('staff', { soldPriceUsd: 0 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rechaza un precio negativo', async () => {
    await expect(
      markSoldOfflineHandler(asRole('staff', { soldPriceUsd: -100 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // Mirrors the 200_000 cap createAuction.ts/updateAuction.ts enforce on the
  // same vehicles' startingPrice/reservePrice/buyNowPrice — there's no
  // callable to correct this field after the fact, so a typo'd extra digit
  // must be rejected up front rather than becoming a permanent bad row.
  it('rechaza un precio por encima del máximo', async () => {
    await expect(
      markSoldOfflineHandler(asRole('staff', { soldPriceUsd: 200_001 })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('escribe log de auditoría', async () => {
    await markSoldOfflineHandler(asRole('staff'));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'auction.sold_offline')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('staff-uid');
  });

  // Not in the brief's 7 — added because it's a distinct code path
  // (not-found vs. failed-precondition) with zero coverage otherwise.
  it('rechaza si la subasta no existe', async () => {
    await expect(
      markSoldOfflineHandler(asRole('staff', { auctionId: 'does-not-exist' })),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
