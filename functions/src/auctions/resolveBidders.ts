import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';

const MAX_UIDS = 50;
// Firestore `in` query cap.
const IN_QUERY_CHUNK = 30;

const InputSchema = z.object({
  uids: z.array(DocId).min(1).max(MAX_UIDS),
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
 *
 * Scoping: a requested uid is only resolved if it actually placed at least
 * one bid somewhere (verified via collectionGroup('bids')). Without this,
 * the role check alone made any admin/staff credential a generic "look up
 * any user's PII by uid" oracle — nothing tied the requested uids to real
 * bidding activity. Legitimate callers already derive `uids` from bid docs
 * they read (Pujas activity feed, bidder detail page), so this is a no-op
 * for them and only closes the gap for a caller invoking the callable
 * directly with unrelated uids.
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

  const verified = new Set<string>();
  for (let i = 0; i < uniqueUids.length; i += IN_QUERY_CHUNK) {
    const chunk = uniqueUids.slice(i, i + IN_QUERY_CHUNK);
    const snap = await adminDb()
      .collectionGroup('bids')
      .where('buyerUid', 'in', chunk)
      .select('buyerUid')
      .get();
    for (const d of snap.docs) verified.add(d.get('buyerUid') as string);
  }
  const scopedUids = uniqueUids.filter((uid) => verified.has(uid));
  if (scopedUids.length === 0) return {};

  const refs = scopedUids.map((uid) => adminDb().doc(`users/${uid}`));
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
