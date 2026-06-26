import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin.js';
import type { SendEmailResult } from './email.js';

export type NotificationType = 'bid_outbid' | 'auction_won';

export interface RecordNotificationInput {
  type: NotificationType;
  toUid: string;
  toEmail: string;
  auctionId: string;
  /** The bid that triggered the notification (for bid_outbid). */
  bidId?: string;
  result: SendEmailResult;
}

/**
 * Persists the outcome of a transactional email so the admin/staff Pujas
 * panel can show whether each bidder was actually notified. Server-only:
 * the `notifications` collection is read-only to admin/staff via rules and
 * never writable from the client.
 */
export async function recordNotification(input: RecordNotificationInput): Promise<void> {
  await adminDb()
    .collection('notifications')
    .add({
      type: input.type,
      toUid: input.toUid,
      toEmail: input.toEmail,
      auctionId: input.auctionId,
      bidId: input.bidId ?? null,
      status: input.result.status,
      reason: input.result.reason ?? null,
      resendId: input.result.resendId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
}
