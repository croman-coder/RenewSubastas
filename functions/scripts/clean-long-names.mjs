// One-shot cleanup: trims any user firstName/lastName longer than 40 chars
// to a sensible 40-char prefix so old garbage data ("Carlos00000000…") stops
// breaking dashboard layouts. Anything that still has digits or non-name
// characters gets logged but not rewritten — that needs a human decision.
//
// Usage: node scripts/clean-long-names.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const NAME_RX = /^[\p{L}\p{M}'’\- .]+$/u;
let touched = 0;
const flagged = [];

const users = await db.collection('users').get();
for (const u of users.docs) {
  const data = u.data();
  const profile = data.profile ?? {};
  const updates = {};
  for (const field of ['firstName', 'lastName']) {
    const v = profile[field];
    if (typeof v !== 'string' || v.length === 0) continue;
    if (v.length > 40) {
      const trimmed = v.slice(0, 40).trim();
      updates[`profile.${field}`] = trimmed;
      console.log(`${u.id} ${field}: "${v}" -> "${trimmed}"`);
    } else if (!NAME_RX.test(v)) {
      flagged.push({ uid: u.id, field, value: v });
    }
  }
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = FieldValue.serverTimestamp();
    await u.ref.update(updates);
    touched++;
  }
}

console.log(`\nDone. Trimmed ${touched} user(s).`);
if (flagged.length > 0) {
  console.log(`\nFlagged (manual review needed — contains digits or non-name chars):`);
  for (const f of flagged) console.log(`  ${f.uid} ${f.field}: "${f.value}"`);
}
process.exit(0);
