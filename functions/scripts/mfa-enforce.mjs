// Enciende o apaga la EXIGENCIA de verificación en dos pasos por rol.
//
//   node scripts/mfa-enforce.mjs                      # estado + quién del equipo ya enroló
//   node scripts/mfa-enforce.mjs admin staff finanzas # exigir a esos roles
//   node scripts/mfa-enforce.mjs off                  # apagar (rollback inmediato)
//
// Escribe app_config/global.security.mfaRequiredRoles, que /api/session lee en
// cada inicio de sesión (apps/web/src/lib/auth/mfa-policy.ts). Cambia al
// instante, sin deploy: es la palanca para apagar si alguien queda afuera.
//
// ANTES de encender, mirá la tabla que imprime: cualquier cuenta de esos
// roles SIN factor enrolado va a ser mandada a enrolar en su próximo login
// (no queda afuera: enrola y entra). Lo que sí deja afuera es un factor
// enrolado en un teléfono que ya no está — para eso está mfa-unenroll.mjs.
//
// Usa la clave del Admin SDK (escribe Firestore y lista usuarios). Aborta si
// está apuntado al emulador sin quererlo o a un proyecto que no es el de
// producción.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const ROLES = new Set(['admin', 'staff', 'finanzas']);
const args = process.argv.slice(2);

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
if (sa.project_id !== 'carbid-staging') throw new Error(`clave de otro proyecto: ${sa.project_id}`);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();

const ref = db.doc('app_config/global');
const current = (await ref.get()).data()?.security?.mfaRequiredRoles ?? [];
console.log('exigido hoy a:', current.length ? current.join(', ') : '(nadie)');

// Who on the team has a factor — the thing to look at before flipping.
console.log('\nequipo interno:');
console.log('rol       enrolado  email');
let token;
const rows = [];
do {
  const page = await auth.listUsers(1000, token);
  for (const u of page.users) {
    const role = u.customClaims?.role;
    if (!ROLES.has(role)) continue;
    rows.push([
      role,
      (u.multiFactor?.enrolledFactors?.length ?? 0) > 0 ? 'sí' : 'NO',
      u.email ?? u.uid,
    ]);
  }
  token = page.pageToken;
} while (token);
rows.sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
for (const [role, en, email] of rows) console.log(`${role.padEnd(10)}${en.padEnd(10)}${email}`);
const missing = rows.filter((r) => r[1] === 'NO').length;
console.log(`\n${rows.length} cuentas internas, ${missing} sin factor`);

if (args.length === 0) process.exit(0);

let next;
if (args.length === 1 && args[0] === 'off') next = [];
else {
  const bad = args.filter((a) => !ROLES.has(a));
  if (bad.length) {
    console.error(`roles desconocidos: ${bad.join(', ')} (válidos: admin staff finanzas, u "off")`);
    process.exit(2);
  }
  next = [...new Set(args)];
}

await ref.set({}, { merge: true });
await ref.update({
  'security.mfaRequiredRoles': next,
  'security.mfaRequiredRolesUpdatedAt': FieldValue.serverTimestamp(),
});
console.log(
  `\nahora exigido a: ${next.length ? next.join(', ') : '(nadie)'}  — efecto inmediato en el próximo login`,
);
process.exit(0);
