// One-shot cleanup: rounds every auction.currentBid (and every bid amount in
// the bids subcollection) to 2 decimals. Dirty values like 16002.55555555
// happened before the placeBid 2-decimal validator landed; this snaps them
// to cents so the dashboard stops showing weird amounts.
//
// Usage: node scripts/snap-bids-to-cents.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const toCents = (n) => Math.round(n * 100) / 100;
const isDirty = (n) => typeof n === 'number' && Math.abs(toCents(n) - n) > 1e-9;

let auctionsTouched = 0;
let bidsTouched = 0;

const auctions = await db.collection('auctions').get();
for (const aDoc of auctions.docs) {
  const a = aDoc.data();
  const updates = {};
  for (const field of ['currentBid', 'startingPrice', 'reservePrice', 'bidIncrement', 'finalPrice']) {
    const v = a[field];
    if (isDirty(v)) updates[field] = toCents(v);
  }
  if (Object.keys(updates).length > 0) {
    console.log(`auction ${aDoc.id}:`, updates);
    await aDoc.ref.update(updates);
    auctionsTouched++;
  }

  const bids = await aDoc.ref.collection('bids').get();
  for (const bDoc of bids.docs) {
    const v = bDoc.data().amount;
    if (isDirty(v)) {
      console.log(`  bid ${bDoc.id}: ${v} -> ${toCents(v)}`);
      await bDoc.ref.update({ amount: toCents(v) });
      bidsTouched++;
    }
  }
}

console.log(`\nDone. Auctions touched: ${auctionsTouched}, bids touched: ${bidsTouched}`);
process.exit(0);
