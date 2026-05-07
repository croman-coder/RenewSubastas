import { getCurrentUser } from '@/lib/auth/server';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { MyBidsTable } from './my-bids-table';

interface Props {
  params: { locale: string; audience: 'retail' | 'wholesale' };
  searchParams?: { tab?: string };
}

export default async function MyBidsPage({ params: { locale, audience }, searchParams }: Props) {
  const user = await getCurrentUser(locale);
  const all = await listMyBids(user.uid);
  const tab = (
    searchParams?.tab === 'outbid' || searchParams?.tab === 'won' || searchParams?.tab === 'lost'
      ? searchParams.tab
      : 'winning'
  ) as 'winning' | 'outbid' | 'won' | 'lost';

  // Deduplicate to one row per auction (keep buyer's latest bid)
  const byAuction = new Map<string, (typeof all)[number]>();
  for (const b of all) {
    if (!byAuction.has(b.auctionId)) byAuction.set(b.auctionId, b);
  }
  const dedup = Array.from(byAuction.values());

  const filtered = dedup.filter((b) => {
    if (tab === 'winning') return b.auctionStatus === 'live' && b.status === 'winning';
    if (tab === 'outbid') return b.auctionStatus === 'live' && b.status === 'outbid';
    if (tab === 'won') return b.auctionStatus === 'ended' && b.iAmWinner;
    if (tab === 'lost') return b.auctionStatus === 'ended' && !b.iAmWinner;
    return false;
  });

  return <MyBidsTable locale={locale} audience={audience} items={filtered} currentTab={tab} />;
}
