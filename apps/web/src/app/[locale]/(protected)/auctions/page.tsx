import { getCurrentUser } from '@/lib/auth/server';
import { listPublicAuctions, type CatalogTab } from '@/lib/buyer/list-public-auctions';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { AuctionsGrid } from './auctions-grid';

interface PageProps {
  params: { locale: string };
  searchParams?: { tab?: string };
}

export default async function BuyerAuctionsCatalog({
  params: { locale },
  searchParams,
}: PageProps) {
  const user = await getCurrentUser(locale);
  const tab: CatalogTab =
    searchParams?.tab === 'closing' || searchParams?.tab === 'favorites' ? searchParams.tab : 'all';

  const favorites = await loadFavorites(user.uid);
  // Admin/staff can browse the catalog too — let them see retail by default
  // (the staff/admin views in /staff/auctions already cover the unfiltered
  // operator perspective). Buyers always see only their own audience.
  const audience = user.audience ?? 'retail';
  const items = await listPublicAuctions({
    tab,
    audience,
    ...(tab === 'favorites' && { favorites }),
  });

  return (
    <AuctionsGrid
      locale={locale}
      items={items}
      currentTab={tab}
      favorites={favorites}
      buyerUid={user.uid}
    />
  );
}
