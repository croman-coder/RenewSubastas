import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import { recordNotification } from '../lib/notify.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  ctaButton,
  SITE_URL,
} from '../lib/email-templates.js';

export interface BidOutbidEvent {
  auctionId: string;
  bidId: string;
  newBid: {
    buyerUid?: string | undefined;
    amount?: number | undefined;
    displacedBuyerUid?: string | undefined;
    displacedAmount?: number | undefined;
  };
}

/**
 * Emails the displaced bidder ("te superaron") and records the outcome to the
 * `notifications` collection so the Pujas panel can show enviado/omitido/falló.
 * Extracted from the trigger so it can be unit-tested directly.
 */
export async function handleBidOutbid(e: BidOutbidEvent): Promise<void> {
  const { auctionId, bidId, newBid } = e;
  const displacedUid = newBid.displacedBuyerUid;
  if (!displacedUid || displacedUid === newBid.buyerUid) return;

  const userSnap = await adminDb().doc(`users/${displacedUid}`).get();
  const email = userSnap.data()?.['email'] as string | undefined;
  const wantsOutbidEmail =
    (userSnap.data()?.['preferences']?.notifications?.outbidEmail as boolean) ?? true;

  if (!email) {
    await recordNotification({
      type: 'bid_outbid',
      toUid: displacedUid,
      toEmail: '',
      auctionId,
      bidId,
      result: { status: 'skipped', reason: 'no_email' },
    });
    return;
  }
  if (!wantsOutbidEmail) {
    await recordNotification({
      type: 'bid_outbid',
      toUid: displacedUid,
      toEmail: email,
      auctionId,
      bidId,
      result: { status: 'skipped', reason: 'pref_off' },
    });
    return;
  }

  const auction = (await adminDb().doc(`auctions/${auctionId}`).get()).data();
  const v = (auction?.['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const fmtUsd = (n: number) =>
    n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const myBid = (newBid.displacedAmount as number) ?? 0;
  const newAmount = (newBid.amount as number) ?? 0;

  const html = emailShell(
    body(
      badge('Te superaron', 'danger') +
        heading(
          'Otro postor tomó la delantera',
          `Tu puja en el <strong style="color:#0a0a0a;">${v['make']} ${v['model']} ${v['year']}</strong> fue superada. Todavía estás a tiempo de recuperar la punta.`,
        ) +
        statPair(
          { label: 'Tu puja', value: `USD ${fmtUsd(myBid)}` },
          { label: 'Puja actual', value: `USD ${fmtUsd(newAmount)}`, strong: true },
        ) +
        ctaButton(`${SITE_URL}/es/auctions/${auctionId}`, 'Volver a pujar'),
    ),
  );

  const result = await sendEmail({
    to: email,
    subject: `Te superaron · ${v['make']} ${v['model']} ${v['year']}`,
    html,
  });
  await recordNotification({
    type: 'bid_outbid',
    toUid: displacedUid,
    toEmail: email,
    auctionId,
    bidId,
    result,
  });
}

export const sendBidOutbid = onDocumentCreated(
  {
    document: 'auctions/{auctionId}/bids/{bidId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const newBid = event.data?.data();
    if (!newBid) return;
    await handleBidOutbid({
      auctionId: event.params['auctionId'] as string,
      bidId: event.params['bidId'] as string,
      newBid: {
        buyerUid: newBid['buyerUid'] as string | undefined,
        amount: newBid['amount'] as number | undefined,
        displacedBuyerUid: newBid['displacedBuyerUid'] as string | undefined,
        displacedAmount: newBid['displacedAmount'] as number | undefined,
      },
    });
  },
);
