// Closes an auction as adjudicated to a given buyer, against the EMULATORS.
// Used to exercise the win banner (and the Meta Pixel Purchase event) without
// waiting for the real scheduler.
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/close-as-sold.ts <auctionId> <winnerUid> <price>
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../src/lib/admin.js';

const [auctionId, winnerUid, price] = process.argv.slice(2);
if (!auctionId || !winnerUid || !price) {
  console.error('usage: close-as-sold.ts <auctionId> <winnerUid> <price>');
  process.exit(1);
}

await adminDb()
  .doc(`auctions/${auctionId}`)
  .update({
    status: 'ended',
    outcome: 'sold',
    winnerUid,
    currentBid: Number(price),
    finalPrice: Number(price),
    endsAt: Timestamp.fromMillis(Date.now() - 60_000),
    updatedAt: Timestamp.now(),
  });

const after = (await adminDb().doc(`auctions/${auctionId}`).get()).data();
console.log('closed:', {
  status: after?.['status'],
  outcome: after?.['outcome'],
  winnerUid: after?.['winnerUid'],
  currentBid: after?.['currentBid'],
});
process.exit(0);
