// Forces a no-op write to every user doc so onUserSync re-runs and refreshes
// custom claims with the new audience field.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('users').get();
console.log(`Touching ${snap.size} user docs to refresh custom claims...`);
let n = 0;
for (const doc of snap.docs) {
  await doc.ref.update({ updatedAt: FieldValue.serverTimestamp() });
  n++;
}
console.log(`Done. Refreshed ${n} users.`);
process.exit(0);
