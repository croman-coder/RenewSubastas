import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Role, Audience } from '../_shared/index.js';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';
import { deriveNameFromDisplayName } from '../lib/name.js';

export interface RegisterGoogleBuyerResult {
  uid: string;
  role: Role;
  audience: Audience | null;
}

/**
 * Public self-registration via Google. A first-time Google user has NO custom
 * claims yet, so we deliberately do NOT use requireSignedIn (which demands
 * role/status). We only require an authenticated Google user, then force
 * buyer/retail server-side — the client can send nothing to influence the role.
 */
export async function registerGoogleBuyerHandler(
  req: CallableRequest,
): Promise<RegisterGoogleBuyerResult> {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  const { uid, token } = req.auth;
  // Require a verified Google identity. Google's own accounts are always
  // verified, so this is defense-in-depth: it stops the code from silently
  // depending on the Firebase console's "one account per email" (account
  // linking) setting to prevent an unverified email from being associated
  // with — or shadowing — an existing staff/admin account. See spec §4.5/§9.
  if (token.firebase?.sign_in_provider !== 'google.com' || token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'not_google');
  }

  const userRef = adminDb().doc(`users/${uid}`);
  const snap = await userRef.get();

  // Existing account (recurring buyer, or a staff/admin who linked Google to the
  // same email). Never overwrite — return their real role/audience.
  if (snap.exists) {
    const data = snap.data()!;
    const role = (data['role'] as Role) ?? 'buyer';
    const audience =
      ((data['profile'] as Record<string, unknown> | undefined)?.['audience'] as
        | Audience
        | undefined) ?? null;
    return { uid, role, audience };
  }

  // New self-registration: force buyer + retail + active, no document yet.
  // `token.name` is the user's own Google display name — Google lets it be
  // ANY Unicode string (unlike createUser's admin form / the buyer self-edit
  // form, both of which restrict firstName/lastName to NAME_CHAR_RX), so a
  // crafted display name like `Ana<img src=x onerror=...>` would otherwise
  // land straight in profile.firstName and from there into every email that
  // greets the buyer by name and every staff-facing panel that lists them.
  // deriveNameFromDisplayName strips disallowed characters rather than
  // rejecting sign-in over an emoji or stray punctuation in an otherwise-fine
  // name, and guarantees a non-empty firstName by falling back to the
  // email local-part, then a generic label (shared with
  // registerPasswordBuyer's own token.name fallback path).
  const email = token.email ?? '';
  const { firstName, lastName } = deriveNameFromDisplayName(
    token.name as string | undefined,
    email,
  );

  await userRef.set({
    uid,
    role: 'buyer',
    email,
    status: 'active',
    provider: 'google',
    profile: {
      firstName,
      lastName,
      audience: 'retail',
    },
    preferences: {
      locale: 'es',
      theme: 'system',
      notifications: {
        outbidEmail: true,
        auctionWonEmail: true,
        newAuctionEmail: false,
      },
    },
    createdBy: 'self:google',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Set claims directly so the client's forced token refresh right after this
  // call already carries them. onUserSync fires too (from the doc write above)
  // and is idempotent: it derives {role,status,audience} from the same doc, so
  // both writers are value-identical by construction. If these payloads ever
  // diverge, last-writer-wins would become a bug — keep them in sync.
  await setUserClaims(uid, { role: 'buyer', status: 'active', audience: 'retail' });

  // Audit logging is non-critical to the user-facing outcome: the account is
  // already fully provisioned above. A logging hiccup must not fail the
  // registration (same best-effort pattern as createUser's welcome email).
  await writeAuditLog({
    actorUid: uid,
    action: 'user.self_register',
    resourceType: 'user',
    resourceId: uid,
    after: { role: 'buyer', audience: 'retail', provider: 'google' },
  }).catch((err) => {
    console.error('[registerGoogleBuyer] audit log failed', err);
  });

  return { uid, role: 'buyer', audience: 'retail' };
}

export const registerGoogleBuyer = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  registerGoogleBuyerHandler,
);
