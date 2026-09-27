import { getCurrentUser } from '@/lib/auth/server';
import { listPublicAuctions, type CatalogTab } from '@/lib/buyer/list-public-auctions';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { listMyBids } from '@/lib/buyer/list-my-bids';
import { myAuctionStates } from '@/lib/buyer/my-auction-states';
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

  // "Vas ganando"/"Te superaron" en cada auto sale de las pujas del comprador
  // (spec 2026-09-27 §5.3): una consulta por vista, en paralelo con el resto.
  // Si falla, el catálogo sale igual sin esas etiquetas: son contexto, no el
  // catálogo. Staff/admin no tienen pujas propias que mostrar — spec §2 dice
  // que su catálogo no cambia — así que ni se pide (B6).
  const isBuyer = user.role === 'buyer';
  const myBidsLoad = isBuyer ? listMyBids(user.uid).catch(() => []) : Promise.resolve([]);

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
  // Map → objeto: lo que cruza al componente de cliente tiene que ser JSON.
  const myStates = isBuyer ? Object.fromEntries(myAuctionStates(await myBidsLoad)) : {};

  return (
    <AuctionsGrid
      locale={locale}
      items={items}
      currentTab={tab}
      favorites={favorites}
      buyerUid={user.uid}
      myStates={myStates}
      isBuyer={isBuyer}
    />
  );
}
