import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { resolveFinalPrice } from './final-price';

export interface WonAuctionDetail {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  finalPrice: number;
  paymentStatus: 'pending_payment' | 'paid' | 'forfeited' | null;
  paymentDeadlineMs: number | null;
  paymentDepositUsd: number | null;
  paymentDepositPercent: number;
  paymentProofUrl: string | null;
  bank: {
    accountHolder: string;
    bankName: string;
    accountType: string;
    accountNumber: string;
    ruc: string;
    bankNamePyg: string;
    accountTypePyg: string;
    accountNumberPyg: string;
    instructionsEs: string;
    instructionsEn: string;
    contactEmail: string;
    contactPhone: string;
  };
}

/**
 * Loads the auction-won detail for a specific buyer. Returns null when:
 *   - auction doesn't exist
 *   - caller didn't win it (winnerUid mismatch)
 *   - auction isn't in a sold state
 *
 * The buyer-side rendering uses the null to 404, avoiding any read into
 * the payment block by a non-winner who guesses an auction id.
 */
export async function loadWonAuction(
  uid: string,
  auctionId: string,
): Promise<WonAuctionDetail | null> {
  const db = getFirestore(getAdminApp());
  const snap = await db.doc(`auctions/${auctionId}`).get();
  if (!snap.exists) return null;
  const a = snap.data()!;
  if (a['winnerUid'] !== uid) return null;
  if (a['status'] !== 'ended' || a['outcome'] !== 'sold') return null;

  const cfg = await loadAppConfigSnapshot();
  const p = cfg.payment;
  const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

  return {
    auctionId,
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
    finalPrice: resolveFinalPrice(a),
    paymentStatus:
      (a['paymentStatus'] as 'pending_payment' | 'paid' | 'forfeited' | undefined) ?? null,
    paymentDeadlineMs:
      (a['paymentDeadline'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
    paymentDepositUsd: (a['paymentDepositUsd'] as number | undefined) ?? null,
    paymentDepositPercent:
      (a['paymentDepositPercent'] as number | undefined) ?? p.depositPercent ?? 0.1,
    paymentProofUrl: (a['paymentProofUrl'] as string | undefined) ?? null,
    bank: {
      accountHolder: p.bankAccountHolder,
      bankName: p.bankName,
      accountType: p.bankAccountType,
      accountNumber: p.bankAccountNumber,
      ruc: p.bankRuc,
      bankNamePyg: p.bankNamePyg,
      accountTypePyg: p.bankAccountTypePyg,
      accountNumberPyg: p.bankAccountNumberPyg,
      instructionsEs: p.instructionsEs,
      instructionsEn: p.instructionsEn,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
    },
  } satisfies WonAuctionDetail;
}
