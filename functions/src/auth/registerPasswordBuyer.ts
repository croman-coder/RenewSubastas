import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Role, Audience } from '../_shared/index.js';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';
import { deriveNameFromDisplayName } from '../lib/name.js';

export interface RegisterPasswordBuyerResult {
  uid: string;
  role: Role;
  audience: Audience | null;
  /**
   * True only when THIS call created the account — see the identical flag on
   * registerGoogleBuyer for why the client can't decide this itself.
   *
   * Note this callable runs on EVERY password sign-in, not only from the
   * registration form (finalize-password-account.ts explains why), so the
   * flag is false for the overwhelming majority of calls. It turns true
   * exactly once per buyer: on whichever call finally provisions them,
   * whether that is the registration tab or a later login by someone who
   * verified their email and never came back.
   */
  isNew: boolean;
}

// Same allowed charset as createUser's admin form / the buyer self-edit
// profile form: Unicode letters/marks, apostrophe (straight + curly),
// hyphen, space, period. Both fields are optional here: the registration
// form (the common case) sends them explicitly and gets strict validation —
// fresh input from a form we control, so rejecting with a clear reason lets
// the visitor fix it immediately. But this callable is also called with NO
// data at all from the plain login form (best-effort re-provisioning for a
// buyer who verified their email but never made it back to the registration
// tab to finish — see login-form.tsx), so when a field is omitted we fall
// back to deriveNameFromDisplayName below instead of rejecting the call.
const NAME_RX = /^[\p{L}\p{M}'’\- .]+$/u;
const InputSchema = z.object({
  firstName: z.string().trim().min(1).max(40).regex(NAME_RX).optional(),
  lastName: z.string().trim().min(1).max(40).regex(NAME_RX).optional(),
});

// Registering is a one-time action per account: once users/{uid} exists
// this handler never writes again (see the transaction below), so this
// ceiling only ever bounds *pre*-success traffic for a single uid — a
// flaky network causing retries, a "waiting for verification" screen
// polling, an impatient double-click on "ya verifiqué". A real attacker
// would need a fresh verified email per attempt anyway (the expensive
// part), so this is a low-cost backstop against a buggy/malicious client
// hammering the transaction, not the primary defense.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000; // 10 minutes

type TxOutcome = { kind: 'existing'; data: FirebaseFirestore.DocumentData } | { kind: 'created' };

/**
 * Public self-registration via email+password. Mirrors registerGoogleBuyer's
 * security model exactly, adapted for the password provider:
 *
 *   - Does NOT call requireSignedIn: a first-time user has no custom claims
 *     yet, so demanding role/status here would reject the very call that's
 *     supposed to grant them.
 *   - Requires token.email_verified === true. Firebase's password provider
 *     (unlike Google) starts every new account unverified, so this check is
 *     the entire safety property of public self-registration: without it, an
 *     attacker could type in someone else's address — including an existing
 *     staff/admin account's — and have a buyer identity provisioned for it
 *     before ever proving they control that inbox, associating with (or
 *     shadowing) that identity. See registerGoogleBuyer.ts for the same
 *     reasoning applied to the Google flow.
 *   - Forces role:'buyer' and audience:'retail' server-side. req.data is
 *     only ever read for the cosmetic name fields (validated below) — never
 *     for role/audience/status, so there is nothing for the client to
 *     inject there.
 *   - Never overwrites an existing users/{uid} doc.
 *
 * Rate-limited per uid via the read-check-write-in-one-transaction pattern
 * placeBid.ts uses for its bid limiter (all tx.get()s before any tx.set()).
 */
export async function registerPasswordBuyerHandler(
  req: CallableRequest,
): Promise<RegisterPasswordBuyerResult> {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  const { uid, token } = req.auth;
  if (token.firebase?.sign_in_provider !== 'password' || token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'not_verified_password');
  }

  // req.data is null when the client calls this with no argument at all
  // (the login-form fallback path) — coalesce before parsing so that's
  // treated as "no explicit names", not a schema error.
  const parsed = InputSchema.safeParse(req.data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const email = token.email ?? '';
  const derived = deriveNameFromDisplayName(token.name as string | undefined, email);
  const firstName = parsed.data.firstName ?? derived.firstName;
  const lastName = parsed.data.lastName ?? derived.lastName;

  const db = adminDb();
  const userRef = db.doc(`users/${uid}`);
  const rlRef = db.doc(`rate_limits/register_${uid}`);

  const outcome: TxOutcome = await db.runTransaction(async (tx) => {
    // ---- all reads first ----
    const now = Date.now();
    const [rlSnap, userSnap] = await Promise.all([tx.get(rlRef), tx.get(userRef)]);

    // Existing account (recurring buyer who somehow re-hits this callable,
    // or a staff/admin who signed up for password auth with the same
    // email). Never overwrite, and don't spend rate-limit budget on a call
    // that touches nothing.
    if (userSnap.exists) {
      return { kind: 'existing', data: userSnap.data()! };
    }

    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError(
        'resource-exhausted',
        'Demasiados intentos. Probá de nuevo en unos minutos.',
      );
    }

    // ---- then all writes ----
    tx.set(userRef, {
      uid,
      role: 'buyer',
      email,
      status: 'active',
      provider: 'password',
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
      createdBy: 'self:password',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(rlRef, { timestamps: [...recent, now] });

    return { kind: 'created' };
  });

  if (outcome.kind === 'existing') {
    const data = outcome.data;
    const role = (data['role'] as Role) ?? 'buyer';
    const audience =
      ((data['profile'] as Record<string, unknown> | undefined)?.['audience'] as
        | Audience
        | undefined) ?? null;
    return { uid, role, audience, isNew: false };
  }

  // Set claims directly so the client's forced token refresh right after this
  // call already carries them. onUserSync fires too (from the doc write above)
  // and is idempotent: it derives {role,status,audience} from the same doc, so
  // both writers are value-identical by construction — same guarantee
  // registerGoogleBuyer relies on.
  await setUserClaims(uid, { role: 'buyer', status: 'active', audience: 'retail' });

  // Audit logging is non-critical to the user-facing outcome: the account is
  // already fully provisioned above. A logging hiccup must not fail the
  // registration.
  await writeAuditLog({
    actorUid: uid,
    action: 'user.self_register',
    resourceType: 'user',
    resourceId: uid,
    after: { role: 'buyer', audience: 'retail', provider: 'password' },
  }).catch((err) => {
    console.error('[registerPasswordBuyer] audit log failed', err);
  });

  return { uid, role: 'buyer', audience: 'retail', isNew: true };
}

export const registerPasswordBuyer = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  registerPasswordBuyerHandler,
);
