// Quita TODOS los segundos factores de una cuenta — la salida de emergencia
// para quien perdió o cambió el teléfono y ya no tiene la app autenticadora.
//
//   node scripts/mfa-unenroll.mjs persona@santarosa.com.py
//
// Después de esto la persona entra sólo con contraseña/Google; si su rol
// exige el segundo factor (mfa-enforce.mjs), la app la manda a enrolar de
// nuevo en ese mismo login. También revoca sus sesiones activas: un token
// vivo emitido con el factor viejo no debe seguir valiendo después de que
// un administrador decidió que ese factor ya no es de confianza.
//
// Es una acción de confianza: la hace un admin que verificó POR OTRO CANAL
// (en persona, llamada) que quien pide es quien dice ser. Queda en
// audit_logs con el email del operador de la máquina.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { userInfo } from 'os';

const email = process.argv[2];
if (!email) {
  console.error('uso: node scripts/mfa-unenroll.mjs <email>');
  process.exit(2);
}

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
if (sa.project_id !== 'carbid-staging') throw new Error(`clave de otro proyecto: ${sa.project_id}`);
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(email);
const before = user.multiFactor?.enrolledFactors ?? [];
console.log(
  `${email} (${user.uid}) rol=${user.customClaims?.role ?? '?'} factores=${before.length}`,
);
if (before.length === 0) {
  console.log('no tiene ningún factor; nada que hacer');
  process.exit(0);
}
for (const f of before)
  console.log(`  - ${f.factorId} "${f.displayName ?? ''}" desde ${f.enrollmentTime}`);

await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
await auth.revokeRefreshTokens(user.uid);
await db.collection('audit_logs').add({
  actorUid: `local:${userInfo().username}`,
  action: 'user.mfa_unenroll',
  resourceType: 'user',
  resourceId: user.uid,
  before: {
    factors: before.map((f) => ({ factorId: f.factorId, displayName: f.displayName ?? null })),
  },
  after: { factors: [] },
  createdAt: FieldValue.serverTimestamp(),
});
const after = (await auth.getUser(user.uid)).multiFactor?.enrolledFactors ?? [];
console.log(`listo: factores ahora=${after.length}, sesiones revocadas, audit_logs escrito`);
process.exit(0);
