// Convierte una exportación de Firebase Auth en filas CSV para
// sql/200_import_auth.sql (tabla legacy.auth_import).
//
//   firebase auth:export export.json --format=json --project carbid-staging
//   node infra/supabase-renew/firebase-auth-to-csv.mjs export.json hash-config.json > import.csv
//
// hash-config.json = signIn.hashConfig del proyecto (API admin de Identity
// Toolkit: algorithm, signerKey, saltSeparator, rounds, memoryCost).
//
// La columna encrypted_password va en el formato que GoTrue reconoce para
// scrypt de Firebase (verificado el 26/9 contra GoTrue 2.189 con una cuenta
// sintética: entra con su contraseña):
//   $fbscrypt$v=1,n=<memoryCost>,r=<rounds>,p=1,ss=<saltSeparator>,sk=<signerKey>$<salt>$<hash>
//
// Los archivos de entrada y la salida contienen hashes de contraseñas y la
// clave firmante del proyecto: permisos 600, y se borran después de importar.
import { readFileSync } from 'fs';

const [exportPath, hashConfigPath] = process.argv.slice(2);
if (!exportPath || !hashConfigPath) {
  console.error('uso: firebase-auth-to-csv.mjs <export.json> <hash-config.json>');
  process.exit(2);
}
const { users } = JSON.parse(readFileSync(exportPath, 'utf8'));
const hc = JSON.parse(readFileSync(hashConfigPath, 'utf8'));
if (hc.algorithm !== 'SCRYPT') throw new Error(`algoritmo inesperado: ${hc.algorithm}`);

const csv = (v) => {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : '');

for (const u of users) {
  const google = (u.providerUserInfo ?? []).find((p) => p.providerId === 'google.com');
  const encrypted = u.passwordHash
    ? `$fbscrypt$v=1,n=${hc.memoryCost},r=${hc.rounds},p=1,ss=${hc.saltSeparator},sk=${hc.signerKey}$${u.salt}$${u.passwordHash}`
    : '';
  process.stdout.write(
    [
      u.localId,
      u.email?.toLowerCase(),
      u.emailVerified === true,
      encrypted,
      google?.rawId,
      google?.email?.toLowerCase(),
      u.displayName ?? google?.displayName,
      u.photoUrl ?? google?.photoUrl,
      u.disabled === true,
      iso(u.createdAt),
      iso(u.lastSignedInAt),
    ]
      .map(csv)
      .join(',') + '\n',
  );
}
