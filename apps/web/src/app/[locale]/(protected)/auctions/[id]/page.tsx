import { notFound } from 'next/navigation';
import { loadAuction } from '@/lib/buyer/load-auction';
import { AuctionDetailView } from './auction-detail-view';

interface Props {
  params: { locale: string; id: string };
}

export default async function BuyerAuctionDetail({ params: { locale, id } }: Props) {
  const auction = await loadAuction(id);
  if (!auction) notFound();
  return <AuctionDetailView locale={locale} initial={auction} />;
}
