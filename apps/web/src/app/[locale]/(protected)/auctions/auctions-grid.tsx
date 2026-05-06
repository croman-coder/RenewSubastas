'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuctionCard } from './auction-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PublicAuction, CatalogTab } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
  currentTab: CatalogTab;
  favorites: string[];
  buyerUid: string;
}

export function AuctionsGrid({ locale, items, currentTab, favorites, buyerUid }: Props) {
  const t = useTranslations('buyer.auctions');
  const router = useRouter();
  const favSet = new Set(favorites);

  function setTab(value: string) {
    const next = value === 'all' ? '' : `?tab=${value}`;
    router.replace(`/${locale}/auctions${next}` as `/${string}`);
  }

  const empty = items.length === 0;
  const emptyMsg = currentTab === 'favorites' ? t('emptyFavorites') : t('empty');

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      </header>
      <Tabs value={currentTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
          <TabsTrigger value="closing">{t('tabs.closing')}</TabsTrigger>
          <TabsTrigger value="favorites">{t('tabs.favorites')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {empty ? (
        <div className="border border-text-subtle/20 rounded-lg p-12 text-center text-text-muted">
          {emptyMsg}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((a) => (
            <AuctionCard
              key={a.id}
              locale={locale}
              auction={a}
              isFavorite={favSet.has(a.id)}
              buyerUid={buyerUid}
            />
          ))}
        </div>
      )}
    </div>
  );
}
