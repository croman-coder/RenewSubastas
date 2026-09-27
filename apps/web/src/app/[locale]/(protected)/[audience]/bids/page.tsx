import { getCurrentUser } from '@/lib/auth/server';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { bidOutcome } from '@/lib/buyer/my-auction-states';
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

  // Pestañas y tarjetas de "Te superaron" con la misma regla (bidOutcome),
  // que mira quién va primero en la subasta y no el `status` de la puja: las
  // pujas viejas y las del seed no lo tienen. En producción es lo mismo que
  // antes, porque placeBid mantiene los dos sincronizados.
  const filtered = dedup.filter((b) => bidOutcome(b) === tab);
  const outbid = dedup
    .filter((b) => bidOutcome(b) === 'outbid')
    .sort((a, b) => a.endsAtMs - b.endsAtMs);

  return (
    <MyBidsTable
      locale={locale}
      audience={audience}
      items={filtered}
      outbid={outbid}
      currentTab={tab}
    />
  );
}
