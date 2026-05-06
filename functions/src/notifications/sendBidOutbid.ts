import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';

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

    await sendEmail({
      to: email,
      subject: 'Te superaron en una subasta',
      html: `<p>Hola ${profile['firstName'] ?? ''},</p>
        <p>Tu puja en <b>${v['make']} ${v['model']} ${v['year']}</b> fue superada.</p>
        <p>Nueva puja: USD ${(newBid['amount'] as number).toLocaleString()}</p>
        <p>Visita la subasta para volver a pujar.</p>
        <p>— CARBID Subastas</p>`,
    });
  },
);
