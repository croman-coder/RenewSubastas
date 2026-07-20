import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Role, Audience } from '../_shared/index.js';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';

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
  if (token.firebase?.sign_in_provider !== 'google.com') {
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
  const displayName = ((token.name as string | undefined) ?? '').trim();
  const [firstName = '', ...rest] = displayName.split(/\s+/);
  const lastName = rest.join(' ');

  await userRef.set({
    uid,
    role: 'buyer',
    email: token.email ?? '',
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
  // call already carries them. onUserSync fires too and is idempotent.
  await setUserClaims(uid, { role: 'buyer', status: 'active', audience: 'retail' });

  await writeAuditLog({
    actorUid: uid,
    action: 'user.self_register',
    resourceType: 'user',
    resourceId: uid,
    after: { role: 'buyer', audience: 'retail', provider: 'google' },
  });

  return { uid, role: 'buyer', audience: 'retail' };
}

export const registerGoogleBuyer = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true',
  },
  registerGoogleBuyerHandler,
);
