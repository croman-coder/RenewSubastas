// One-shot backfill for the staff/admin/finanzas lockout fixed alongside
// this script: redeemPasswordReset.ts now sets emailVerified:true when an
// invitee sets their password (receiving the emailed link IS proof of
// inbox control — same reasoning Firebase's own oobCode flow uses). But
// that only fixes accounts going forward; every account that already
// redeemed its invite before this fix shipped is stuck with
// emailVerified:false forever, which login-form.tsx's new
// unverified-self-registration gate misreads as "never finished signing
// up" and locks out of every login.
//
// This backfills exactly those accounts: Auth users with emailVerified
// still false, but with a users/{uid} Firestore doc. That second
// condition is deliberate and load-bearing, not incidental — createUser.ts
// creates the Firestore doc immediately at invite time, before the
// invitee ever sets a password, while registerGoogleBuyer.ts /
// registerPasswordBuyer.ts only create one AFTER a self-registration is
// actually verified. So "emailVerified:false with a doc" can only be an
// invited account that redeemed its link before this fix — never an
// abandoned self-registration, which by construction has no doc yet. This
// script must NOT touch those; verifying them for free would defeat the
// entire point of requiring proof of inbox control on public
// self-registration.
//
// Idempotent — already-verified users are skipped, safe to re-run.
//
// Usage:
//   node scripts/backfill-verified-invited-accounts.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

console.log('Scanning Auth users for invited-but-unverified accounts...');

let fixed = 0;
let leftUnverified = 0;
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    if (user.emailVerified) continue;
    const doc = await db.doc(`users/${user.uid}`).get();
    if (!doc.exists) {
      // Abandoned (or still in-progress) self-registration — leave as is.
      leftUnverified++;
      continue;
    }
    await auth.updateUser(user.uid, { emailVerified: true });
    console.log(`  verified: ${user.uid} (${user.email})`);
    fixed++;
  }
  pageToken = page.pageToken;
} while (pageToken);

console.log(
  `\nDone. Backfilled ${fixed} invited account(s). ` +
    `Left ${leftUnverified} unverified self-registration(s) untouched.`,
);
process.exit(0);
