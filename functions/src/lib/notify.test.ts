import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from './admin.js';
import { recordNotification } from './notify.js';

async function clearNotifications() {
  const docs = await adminDb().collection('notifications').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

describe('recordNotification', () => {
  beforeEach(clearNotifications);

  it('writes a notification doc with status and context', async () => {
    await recordNotification({
      type: 'bid_outbid',
      toUid: 'buyer-1',
      toEmail: 'buyer1@example.com',
      auctionId: 'auc-1',
      bidId: 'bid-1',
      result: { status: 'sent', resendId: 're_123' },
    });
    const snap = await adminDb().collection('notifications').get();
    expect(snap.size).toBe(1);
    const d = snap.docs[0].data();
    expect(d.type).toBe('bid_outbid');
    expect(d.toUid).toBe('buyer-1');
    expect(d.auctionId).toBe('auc-1');
    expect(d.bidId).toBe('bid-1');
    expect(d.status).toBe('sent');
    expect(d.resendId).toBe('re_123');
  });

  it('records skipped with reason and null bidId', async () => {
    await recordNotification({
      type: 'auction_won',
      toUid: 'buyer-2',
      toEmail: '',
      auctionId: 'auc-2',
      result: { status: 'skipped', reason: 'no_email' },
    });
    const snap = await adminDb().collection('notifications').get();
    const d = snap.docs[0].data();
    expect(d.status).toBe('skipped');
    expect(d.reason).toBe('no_email');
    expect(d.bidId).toBeNull();
  });
});
