import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const MAX = 200_000;

const snap = await db.collection('auctions').get();
console.log(`Scanning ${snap.size} auctions for corrupted currentBid > ${MAX}...`);

let fixed = 0;
for (const doc of snap.docs) {
  const data = doc.data();
  const currentBid = Number(data.currentBid);
  const startingPrice = Number(data.startingPrice ?? 0);
  if (!Number.isFinite(currentBid) || currentBid > MAX) {
    console.log(`Fixing auction ${doc.id}: currentBid=${data.currentBid} -> 0 (startingPrice=${startingPrice})`);
    await doc.ref.update({
      currentBid: 0,
      currentBidderUid: null,
      bidCount: 0,
      updatedAt: new Date(),
    });

    const bidsSnap = await doc.ref.collection('bids').get();
    console.log(`  Removing ${bidsSnap.size} bids...`);
    const batch = db.batch();
    bidsSnap.docs.forEach(b => batch.delete(b.ref));
    if (bidsSnap.size > 0) await batch.commit();
    fixed++;
  }
}
console.log(`Done. Fixed ${fixed} auctions.`);
process.exit(0);
