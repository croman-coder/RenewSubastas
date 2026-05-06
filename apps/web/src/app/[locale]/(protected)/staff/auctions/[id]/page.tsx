import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const snap = await getFirestore(getAdminApp()).doc(`auctions/${id}`).get();
  if (!snap.exists) notFound();
  const data = snap.data()!;
  const ms = (k: string) => (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

  return (
    <AuctionDetailView
      locale={locale}
      auctionId={id}
      initial={{
        vehicleMake: (v['make'] as string) ?? '',
        vehicleModel: (v['model'] as string) ?? '',
        vehicleYear: (v['year'] as number) ?? 0,
        thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
        startingPrice: (data['startingPrice'] as number) ?? 0,
        currentBid: (data['currentBid'] as number) ?? 0,
        bidCount: (data['bidCount'] as number) ?? 0,
        status: (data['status'] as 'scheduled' | 'live' | 'ended' | 'cancelled') ?? 'scheduled',
        endsAtMs: ms('endsAt'),
        startsAtMs: ms('startsAt'),
      }}
    />
  );
}
