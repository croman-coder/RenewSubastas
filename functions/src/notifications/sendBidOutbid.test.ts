import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from '../lib/admin.js';
import { handleBidOutbid } from './sendBidOutbid.js';

async function clearAll() {
  for (const c of ['notifications', 'users']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('sendBidOutbid notification record', () => {
  beforeEach(clearAll);

  it('records skipped:no_email when the displaced bidder has no email', async () => {
    await adminDb()
      .doc('users/displaced-1')
      .set({
        uid: 'displaced-1',
        profile: { firstName: 'Ana', lastName: 'Díaz' },
        preferences: { notifications: { outbidEmail: true } },
      });
    await adminDb()
      .doc('auctions/auc-1')
      .set({
        vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2021 },
      });

    await handleBidOutbid({
      auctionId: 'auc-1',
      bidId: 'bid-9',
      newBid: {
        buyerUid: 'buyer-2',
        amount: 12500,
        displacedBuyerUid: 'displaced-1',
        displacedAmount: 12000,
      },
    });

    const snap = await adminDb().collection('notifications').get();
    expect(snap.size).toBe(1);
    const d = snap.docs[0].data();
    expect(d.type).toBe('bid_outbid');
    expect(d.toUid).toBe('displaced-1');
    expect(d.status).toBe('skipped');
    expect(d.reason).toBe('no_email');
  });

  it('records skipped:pref_off when the displaced bidder disabled outbid emails', async () => {
    await adminDb()
      .doc('users/displaced-2')
      .set({
        uid: 'displaced-2',
        email: 'd2@example.com',
        profile: { firstName: 'Beto' },
        preferences: { notifications: { outbidEmail: false } },
      });
    await adminDb()
      .doc('auctions/auc-2')
      .set({
        vehicleSnapshot: { make: 'Honda', model: 'Civic', year: 2020 },
      });

    await handleBidOutbid({
      auctionId: 'auc-2',
      bidId: 'bid-10',
      newBid: {
        buyerUid: 'buyer-3',
        amount: 9000,
        displacedBuyerUid: 'displaced-2',
        displacedAmount: 8500,
      },
    });

    const d = (await adminDb().collection('notifications').get()).docs[0].data();
    expect(d.status).toBe('skipped');
    expect(d.reason).toBe('pref_off');
  });

  it('does not notify when there is no displaced bidder', async () => {
    await handleBidOutbid({
      auctionId: 'auc-3',
      bidId: 'bid-11',
      newBid: { buyerUid: 'buyer-4', amount: 5000 },
    });
    const snap = await adminDb().collection('notifications').get();
    expect(snap.size).toBe(0);
  });
});
