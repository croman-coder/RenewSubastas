import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { loadAuction } from '@/lib/buyer/load-auction';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function BuyerAuctionDetail({ params: { locale, id } }: Props) {
  const auction = await loadAuction(id);
  if (!auction) notFound();
  const user = await getCurrentUser(locale);
  const config = await loadAppConfigSnapshot();
  return (
    <AuctionDetailView
      locale={locale}
      initial={auction}
      myUid={user.uid}
      allowManualIncrement={config.bid.allowManualIncrement}
      financingConfig={config.financing}
    />
  );
}
