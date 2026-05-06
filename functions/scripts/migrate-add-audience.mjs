// One-shot migration: backfill `profile.audience = 'retail'` on every legacy
// buyer document and `audience = 'retail'` on every vehicle and auction that
// pre-dates the audience split. Idempotent — running twice is a no-op.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/migrate-add-audience.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log('Backfilling profile.audience on buyer users...');
const usersSnap = await db.collection('users').where('role', '==', 'buyer').get();
let userFixed = 0;
for (const doc of usersSnap.docs) {
  const data = doc.data();
  if (data.profile?.audience) continue;
  await doc.ref.update({ 'profile.audience': 'retail' });
  userFixed++;
}
console.log(`  ${userFixed} buyer users updated.`);

console.log('Backfilling audience on vehicles...');
const vehiclesSnap = await db.collection('vehicles').get();
let vehicleFixed = 0;
for (const doc of vehiclesSnap.docs) {
  if (doc.data().audience) continue;
  await doc.ref.update({ audience: 'retail' });
  vehicleFixed++;
}
console.log(`  ${vehicleFixed} vehicles updated.`);

console.log('Backfilling audience on auctions...');
const auctionsSnap = await db.collection('auctions').get();
let auctionFixed = 0;
for (const doc of auctionsSnap.docs) {
  if (doc.data().audience) continue;
  await doc.ref.update({ audience: 'retail' });
  auctionFixed++;
}
console.log(`  ${auctionFixed} auctions updated.`);

console.log('Done.');
process.exit(0);
