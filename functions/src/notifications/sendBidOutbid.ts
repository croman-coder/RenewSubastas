import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  ctaButton,
  SITE_URL,
} from '../lib/email-templates.js';

export const sendBidOutbid = onDocumentCreated(
  {
    document: 'auctions/{auctionId}/bids/{bidId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const newBid = event.data?.data();
    if (!newBid) return;

    // Find the previous winning bid (now outbid)
    const auctionId = event.params['auctionId'] as string;
    const prevQ = await adminDb()
      .collection(`auctions/${auctionId}/bids`)
      .where('status', '==', 'outbid')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const prevBid = prevQ.docs[0]?.data();
    if (!prevBid || prevBid['buyerUid'] === newBid['buyerUid']) return;

    const userSnap = await adminDb().doc(`users/${prevBid['buyerUid']}`).get();
    const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, string>;
    const email = userSnap.data()?.['email'] as string | undefined;
    const wantsOutbidEmail =
      (userSnap.data()?.['preferences']?.notifications?.outbidEmail as boolean) ?? true;
    if (!email || !wantsOutbidEmail) return;

    const auction = (await adminDb().doc(`auctions/${auctionId}`).get()).data();
    const v = (auction?.['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

    const fmtUsd = (n: number) =>
      n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const myBid = (prevBid['amount'] as number) ?? 0;
    const newAmount = (newBid['amount'] as number) ?? 0;

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

    await sendEmail({
      to: email,
      subject: `Te superaron · ${v['make']} ${v['model']} ${v['year']}`,
      html,
    });
  },
);
