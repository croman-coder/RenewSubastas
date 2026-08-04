import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';

const MAX_UIDS = 50;

const InputSchema = z.object({
  uids: z.array(z.string().min(1)).min(1).max(MAX_UIDS),
});

export interface BidderContact {
  displayName: string;
  email: string;
  phone: string;
}

/**
 * Resolves bidder contact (name/email/phone ONLY) for the Pujas panel.
 * Admin and staff only — the same narrow exposure used by getWinnerContact,
 * so the client never bulk-reads the users collection. Unknown uids are
 * omitted from the result.
 */
export async function resolveBiddersHandler(
  req: CallableRequest,
): Promise<Record<string, BidderContact>> {
  const { role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Solo admin o staff pueden ver el contacto.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  const uniqueUids = Array.from(new Set(parsed.data.uids));
  const refs = uniqueUids.map((uid) => adminDb().doc(`users/${uid}`));
  const snaps = await adminDb().getAll(...refs);

  const out: Record<string, BidderContact> = {};
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const u = snap.data() ?? {};
    const profile = (u['profile'] ?? {}) as Record<string, unknown>;
    out[snap.id] = {
      displayName:
        `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim(),
      email: (u['email'] as string) ?? '',
      phone: (profile['phone'] as string) ?? '',
    };
  }
  return out;
}

export const resolveBidders = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  resolveBiddersHandler,
);
