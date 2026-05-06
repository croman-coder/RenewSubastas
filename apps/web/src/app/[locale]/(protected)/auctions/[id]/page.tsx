import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { loadAuction } from '@/lib/buyer/load-auction';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function BuyerAuctionDetail({ params: { locale, id } }: Props) {
  // Run all three reads in parallel — they're independent and the page
  // can't render until all of them land anyway. Halves the perceived
  // load time on the slowest cold-start case.
  const [auction, user, config] = await Promise.all([
    loadAuction(id),
    getCurrentUser(locale),
    loadAppConfigSnapshot(),
  ]);
  if (!auction) notFound();
  return (
    <AuctionDetailView
      locale={locale}
      initial={auction}
      myUid={user.uid}
      allowManualIncrement={config.bid.allowManualIncrement}
      financingConfig={config.financing}
      currencyConfig={config.currency}
    />
  );
}
