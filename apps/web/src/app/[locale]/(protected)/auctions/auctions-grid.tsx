'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Gavel, Heart, Search } from 'lucide-react';
import { AuctionCard } from './auction-card';
import { AuctionRow } from './auction-row';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { batchClock } from '@/lib/auctions/batch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { matchesSearch } from '@/lib/buyer/search';
import { ownStatePill, type MyAuctionState } from '@/lib/buyer/my-auction-states';
import type { PublicAuction, CatalogTab } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
  currentTab: CatalogTab;
  favorites: string[];
  buyerUid: string;
  /**
   * Estado propio por subasta en vivo (myAuctionStates). Objeto y no Map:
   * cruza del servidor al cliente y tiene que ser JSON.
   */
  myStates: Record<string, MyAuctionState>;
}

export function AuctionsGrid({ locale, items, currentTab, favorites, buyerUid, myStates }: Props) {
  const t = useTranslations('buyer.auctions');
  const router = useRouter();
  const favSet = new Set(favorites);
  // Búsqueda sobre la lista ya cargada, sin consulta nueva (spec 2026-09-27 §5.3).
  const [query, setQuery] = useState('');

  function setTab(value: string) {
    const next = value === 'all' ? '' : `?tab=${value}`;
    router.replace(`/${locale}/auctions${next}` as `/${string}`);
  }

  const empty = items.length === 0;
  const clock = batchClock(items);
  const visible = items.filter((a) => matchesSearch(a, query));

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-5 py-5 sm:px-6 sm:py-6 animate-in fade-in slide-in-from-top-2 duration-500">
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
          {clock !== null && (
            <BatchCountdown
              endsAtMs={clock.at}
              mode={clock.mode}
              className="w-full lg:w-auto lg:min-w-[22rem]"
            />
          )}

          <div className="text-xs text-text-muted lg:text-right">
            <span className="num-tab text-text-strong font-semibold text-base">{items.length}</span>{' '}
            {items.length === 1 ? 'subasta' : 'subastas'}
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {/* Por debajo de lg las pestañas son un control segmentado de tres
            que ocupa el ancho; desde lg, las mismas pestañas de siempre. Los
            íconos se esconden en el teléfono para que "Cierran pronto" entre. */}
        <Tabs value={currentTab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 scrollbar-none lg:inline-flex lg:w-auto lg:justify-start lg:overflow-x-auto">
            <TabsTrigger value="all" className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm">
              <Gavel className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.all')}
            </TabsTrigger>
            <TabsTrigger value="closing" className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm">
              <Search className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.closing')}
            </TabsTrigger>
            <TabsTrigger
              value="favorites"
              className="gap-1.5 px-1.5 text-[13px] lg:px-3 lg:text-sm"
            >
              <Heart className="hidden w-3.5 h-3.5 sm:inline-block" /> {t('tabs.favorites')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative lg:hidden">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Marca, modelo o año"
            aria-label="Buscar por marca, modelo o año"
            className="h-11 pl-9"
          />
        </div>
      </div>

      {empty ? (
        <EmptyState tab={currentTab} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-12 text-center text-sm text-text-muted">
          Ninguna subasta coincide con “{query.trim()}”.
        </div>
      ) : (
        <>
          <AuctionRowList
            locale={locale}
            items={visible}
            favSet={favSet}
            buyerUid={buyerUid}
            myStates={myStates}
          />
          {/* Desde sm, la grilla de tarjetas de siempre. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((a, i) => (
              <AuctionCard
                key={a.id}
                locale={locale}
                auction={a}
                isFavorite={favSet.has(a.id)}
                buyerUid={buyerUid}
                index={i}
                myState={myStates[a.id]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Filas del teléfono (< sm). Tiene su propio reloj para que el tic de cada
 * segundo re-renderice solo las filas y no toda la grilla.
 */
function AuctionRowList({
  locale,
  items,
  favSet,
  buyerUid,
  myStates,
}: {
  locale: string;
  items: PublicAuction[];
  favSet: Set<string>;
  buyerUid: string;
  myStates: Record<string, MyAuctionState>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <ul className="space-y-3 sm:hidden">
      {items.map((a) => (
        <li key={a.id}>
          <AuctionRow
            locale={locale}
            auction={a}
            nowMs={now}
            pill={ownStatePill(myStates[a.id], a)}
            isFavorite={favSet.has(a.id)}
            buyerUid={buyerUid}
          />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ tab }: { tab: CatalogTab }) {
  const t = useTranslations('buyer.auctions');
  const Icon = tab === 'favorites' ? Heart : Gavel;
  const msg = tab === 'favorites' ? t('emptyFavorites') : t('empty');
  return (
    <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center animate-in fade-in duration-500">
      <Icon className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
      <p className="text-sm text-text-muted">{msg}</p>
    </div>
  );
}
