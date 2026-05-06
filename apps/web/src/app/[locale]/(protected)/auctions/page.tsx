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
  // Admin/staff can browse the catalog too — let them see retail by default
  // (the staff/admin views in /staff/auctions already cover the unfiltered
  // operator perspective). Buyers always see only their own audience.
  const audience = user.audience ?? 'retail';

  // Favorites and the catalog query are independent on the 'all' / 'closing'
  // tabs; run them in parallel. Only the 'favorites' tab needs to know
  // favorites first to filter.
  let favorites: string[];
  let items;
  if (tab === 'favorites') {
    favorites = await loadFavorites(user.uid);
    items = await listPublicAuctions({ tab, audience, favorites });
  } else {
    [favorites, items] = await Promise.all([
      loadFavorites(user.uid),
      listPublicAuctions({ tab, audience }),
    ]);
  }

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
