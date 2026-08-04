import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const db = getFirestore(getAdminApp());
  const [snap, privateSnap, user] = await Promise.all([
    db.doc(`auctions/${id}`).get(),
    // reservePrice lives here, not on the parent doc — see
    // AuctionPrivateSchema. Staff/admin/finanzas read it via the Admin SDK,
    // same as this whole page already does.
    db.doc(`auctions/${id}/private/internal`).get(),
    getCurrentUser(locale),
  ]);
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const reservePrice = (privateSnap.data()?.['reservePrice'] as number | undefined) ?? null;
  const ms = (k: string) => (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const winnerUid = (data['winnerUid'] as string | undefined) ?? null;

  // Pull a minimal winner snapshot when the auction sold, so the staff
  // detail view can render "ganador: nombre · email" without an extra
  // client-side fetch on every render.
  let winner: { firstName: string; lastName: string; email: string } | null = null;
  if (winnerUid) {
    const wSnap = await getFirestore(getAdminApp()).doc(`users/${winnerUid}`).get();
    if (wSnap.exists) {
      const wd = wSnap.data()!;
      const wp = (wd['profile'] ?? {}) as Record<string, string>;
      winner = {
        firstName: wp['firstName'] ?? '',
        lastName: wp['lastName'] ?? '',
        email: (wd['email'] as string) ?? '',
      };
    }
  }

  return (
    <AuctionDetailView
      locale={locale}
      auctionId={id}
      role={user.role}
      initial={{
        vehicleMake: (v['make'] as string) ?? '',
        vehicleModel: (v['model'] as string) ?? '',
        vehicleYear: (v['year'] as number) ?? 0,
        thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
        startingPrice: (data['startingPrice'] as number) ?? 0,
        reservePrice,
        currentBid: (data['currentBid'] as number) ?? 0,
        bidCount: (data['bidCount'] as number) ?? 0,
        status: (data['status'] as 'scheduled' | 'live' | 'ended' | 'cancelled') ?? 'scheduled',
        outcome: (data['outcome'] as 'sold' | 'reserve_not_met' | 'no_bids' | undefined) ?? null,
        finalPrice: (data['finalPrice'] as number | undefined) ?? null,
        endsAtMs: ms('endsAt'),
        startsAtMs: ms('startsAt'),
        winner,
        payment: {
          status:
            (data['paymentStatus'] as 'pending_payment' | 'paid' | 'forfeited' | undefined) ?? null,
          depositUsd: (data['paymentDepositUsd'] as number | undefined) ?? null,
          deadlineMs: ms('paymentDeadline') || null,
          note: (data['paymentNote'] as string | undefined) ?? null,
        },
      }}
    />
  );
}
