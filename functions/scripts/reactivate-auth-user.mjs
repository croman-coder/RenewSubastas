// One-shot recovery for users whose Firestore status was flipped back to
// `active` BEFORE the updateUserRole fix that re-enables the Firebase Auth
// account. Without this, Auth still has `disabled: true` and the user
// physically cannot sign in.
//
// Usage: node scripts/reactivate-auth-user.mjs <email>
//
// Effect:
//   1. Finds the Auth user by email
//   2. Sets disabled=false on the Auth user
//   3. Mirrors Firestore status=active and clears deletedAt
//   4. Re-applies custom claims so the JWT contains role/status/audience
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/reactivate-auth-user.mjs <email>');
  process.exit(1);
}

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

const authUser = await auth.getUserByEmail(email).catch(() => null);
if (!authUser) {
  console.error(`No Firebase Auth user found with email ${email}`);
  process.exit(2);
}

const uid = authUser.uid;
console.log(`Found Auth user ${uid} (disabled=${authUser.disabled}) for ${email}`);

const docRef = db.doc(`users/${uid}`);
const docSnap = await docRef.get();
if (!docSnap.exists) {
  console.error(`No Firestore user doc at users/${uid}`);
  process.exit(3);
}
const data = docSnap.data();
const role = data.role ?? 'buyer';
const audience = data.profile?.audience ?? (role === 'buyer' ? 'retail' : undefined);

await auth.updateUser(uid, { disabled: false });
console.log('Auth.disabled -> false');

await auth.setCustomUserClaims(uid, {
  role,
  status: 'active',
  ...(audience ? { audience } : {}),
});
console.log(`Claims set: role=${role}, status=active${audience ? `, audience=${audience}` : ''}`);

await docRef.update({
  status: 'active',
  deletedAt: FieldValue.delete(),
  updatedAt: FieldValue.serverTimestamp(),
});
console.log('Firestore status -> active, deletedAt cleared');

console.log(`\nDone. ${email} should now be able to sign in.`);
process.exit(0);
