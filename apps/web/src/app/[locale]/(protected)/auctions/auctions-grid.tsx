'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Gavel, Heart, Search } from 'lucide-react';
import { AuctionCard } from './auction-card';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { batchEndsAt } from '@/lib/auctions/batch';
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
  const batchEnd = batchEndsAt(items);

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-5 py-5 sm:px-6 sm:py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div
          aria-hidden
          className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-copper/10 blur-3xl pointer-events-none"
        />
        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
              Renew · Subastas
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Encontrá tu próximo vehículo y pujá en tiempo real.
            </p>
          </div>

          {/* Batch clock. Lotes share one closing time, so it belongs here
              once rather than being read off each card. */}
          {batchEnd !== null && (
            <BatchCountdown endsAtMs={batchEnd} className="w-full lg:w-auto lg:min-w-[22rem]" />
          )}

          <div className="text-xs text-text-muted lg:text-right">
            <span className="num-tab text-text-strong font-semibold text-base">{items.length}</span>{' '}
            {items.length === 1 ? 'subasta' : 'subastas'}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto justify-start overflow-x-auto scrollbar-none">
          <TabsTrigger value="all" className="gap-1.5">
            <Gavel className="w-3.5 h-3.5" /> {t('tabs.all')}
          </TabsTrigger>
          <TabsTrigger value="closing" className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> {t('tabs.closing')}
          </TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart className="w-3.5 h-3.5" /> {t('tabs.favorites')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {empty ? (
        <EmptyState tab={currentTab} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((a, i) => (
            <AuctionCard
              key={a.id}
              locale={locale}
              auction={a}
              isFavorite={favSet.has(a.id)}
              buyerUid={buyerUid}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: CatalogTab }) {
  const t = useTranslations('buyer.auctions');
  const Icon = tab === 'favorites' ? Heart : Gavel;
  const msg = tab === 'favorites' ? t('emptyFavorites') : t('empty');
  return (
    <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center animate-in fade-in duration-500">
      <Icon className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
      <p className="text-sm text-text-muted">{msg}</p>
    </div>
  );
}
