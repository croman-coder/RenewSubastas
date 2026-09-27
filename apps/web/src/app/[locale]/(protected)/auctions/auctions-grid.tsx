'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Gavel, Heart, Search } from 'lucide-react';
import { AuctionCard } from './auction-card';
import { AuctionRow } from './auction-row';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { batchClock } from '@/lib/auctions/batch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  /** Solo el comprador ve filas de celular, buscador y pestañas segmentadas — staff/admin conservan el catálogo de siempre en todos los anchos (spec §2, B6). */
  isBuyer: boolean;
}

export function AuctionsGrid({
  locale,
  items,
  currentTab,
  favorites,
  buyerUid,
  myStates,
  isBuyer,
}: Props) {
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

      <Tabs value={currentTab} onValueChange={setTab} className="space-y-3">
        {/* Comprador, por debajo de lg: control segmentado de tres que ocupa
            el ancho, ≥44 px de alto (C3), con íconos escondidos en el
            teléfono para que "Cierran pronto" entre. Staff/admin conservan
            el catálogo de siempre en todos los anchos (spec §2, B6). */}
        <TabsList
          className={
            isBuyer
              ? 'grid h-11 w-full grid-cols-3 scrollbar-none lg:h-10 lg:inline-flex lg:w-auto lg:justify-start lg:overflow-x-auto'
              : 'w-full sm:w-auto justify-start overflow-x-auto scrollbar-none'
          }
        >
          <TabsTrigger
            value="all"
            className={
              isBuyer ? 'h-11 gap-1.5 px-1.5 text-[13px] lg:h-8 lg:px-3 lg:text-sm' : 'gap-1.5'
            }
          >
            <Gavel className={isBuyer ? 'hidden w-3.5 h-3.5 sm:inline-block' : 'w-3.5 h-3.5'} />{' '}
            {t('tabs.all')}
          </TabsTrigger>
          <TabsTrigger
            value="closing"
            className={
              isBuyer ? 'h-11 gap-1.5 px-1.5 text-[13px] lg:h-8 lg:px-3 lg:text-sm' : 'gap-1.5'
            }
          >
            <Search className={isBuyer ? 'hidden w-3.5 h-3.5 sm:inline-block' : 'w-3.5 h-3.5'} />{' '}
            {t('tabs.closing')}
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className={
              isBuyer ? 'h-11 gap-1.5 px-1.5 text-[13px] lg:h-8 lg:px-3 lg:text-sm' : 'gap-1.5'
            }
          >
            <Heart className={isBuyer ? 'hidden w-3.5 h-3.5 sm:inline-block' : 'w-3.5 h-3.5'} />{' '}
            {t('tabs.favorites')}
          </TabsTrigger>
        </TabsList>

        {isBuyer && (
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
        )}

        {/* Antes este panel quedaba fuera de <Tabs>: cada TabsTrigger apuntaba
            con aria-controls a un id que no existía en el DOM (C2). El
            filtrado real lo sigue haciendo el estado de React (currentTab
            viene de la URL), no Radix — alcanza con un único TabsContent. */}
        <TabsContent value={currentTab} className="mt-3 space-y-6">
          {empty ? (
            <EmptyState tab={currentTab} />
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-12 text-center text-sm text-text-muted">
              Ninguna subasta coincide con “{query.trim()}”.
            </div>
          ) : isBuyer ? (
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
          ) : (
            // Staff/admin: la grilla de siempre, en todos los anchos.
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((a, i) => (
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
        </TabsContent>
      </Tabs>
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
            // El tick del servidor que pasa el status a 'ended' corre ~1/min:
            // sin este chequeo del reloj del cliente, la píldora "Vas
            // ganando"/"Te superaron" podía seguir viva unos segundos después
            // de cerrada (B5).
            pill={a.endsAtMs > now ? ownStatePill(myStates[a.id], a) : null}
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
