import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';

const InputSchema = z.object({
  auctionId: z.string().min(1),
  winnerUid: z.string().min(1),
});

export interface WinnerContact {
  displayName: string;
  email: string;
  phone: string;
}

/**
 * Resolves the contact details of an auction's winner for the sales ledger.
 *
 * Finanzas (and admin) need a winner's name + email + phone to follow up on
 * the deposit. Previously the sales panel read the full `users/{uid}` doc
 * directly from the client, which required a Firestore rule that let finanzas
 * read EVERY user's PII (CI, email, phone) — far more than the job needs.
 *
 * This callable is the narrow replacement: it returns ONLY name/email/phone,
 * and ONLY for a uid that is the actual `winnerUid` of an ended+sold auction.
 * It cannot be used to enumerate arbitrary users.
 */
export async function getWinnerContactHandler(req: CallableRequest): Promise<WinnerContact> {
  const { role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'finanzas') {
    throw new HttpsError('permission-denied', 'Solo admin o finanzas pueden ver el contacto.');
  }

  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, winnerUid } = parsed.data;

  // The uid must genuinely be the winner of a sold auction — this is what
  // keeps the endpoint from being a general user-lookup tool.
  const aSnap = await adminDb().doc(`auctions/${auctionId}`).get();
  if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
  const a = aSnap.data()!;
  if (a['status'] !== 'ended' || a['outcome'] !== 'sold' || a['winnerUid'] !== winnerUid) {
    throw new HttpsError('failed-precondition', 'El usuario no es ganador de esta subasta.');
  }

  const uSnap = await adminDb().doc(`users/${winnerUid}`).get();
  const u = uSnap.data() ?? {};
  const profile = (u['profile'] ?? {}) as Record<string, unknown>;
  const displayName =
    `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim();
  const email = (u['email'] as string) ?? '';
  const phone = (profile['phone'] as string) ?? '';

  return { displayName, email, phone };
}

export const getWinnerContact = onCall({ region: 'us-central1' }, getWinnerContactHandler);
