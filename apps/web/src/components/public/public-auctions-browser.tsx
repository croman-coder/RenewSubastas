'use client';
import { useMemo, useState, useId } from 'react';
import { Gavel, Search, X } from 'lucide-react';
import { PublicAuctionCard } from './public-auction-card';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
}

type Filter = 'all' | 'live' | 'closing';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'live', label: 'En vivo' },
  { id: 'closing', label: 'Cierran hoy' },
];

const DAY_MS = 24 * 3600_000;

/**
 * Search + filter over the already-loaded public catalog.
 *
 * Filtering is client-side on purpose: the landing ships the full retail
 * catalog (capped at 50 by the loader) in the initial payload, so filtering
 * here is instant and costs no round trip. If the catalog ever outgrows that
 * cap this should move to server-side query params.
 */
export function PublicAuctionsBrowser({ locale, items }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchId = useId();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // `closing` is evaluated against a timestamp captured per render rather
    // than a ticking clock — the cutoff is a whole day away, so a card
    // crossing it mid-session isn't worth a re-render every second.
    const closingCutoff = Date.now() + DAY_MS;
    return items.filter((a) => {
      if (filter === 'live' && a.status !== 'live') return false;
      if (filter === 'closing' && (a.status !== 'live' || a.endsAtMs > closingCutoff)) return false;
      if (!q) return true;
      return `${a.make} ${a.model} ${a.year}`.toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  const filtering = query.trim().length > 0 || filter !== 'all';

  return (
    <section aria-labelledby="subastas-heading" className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2
            id="subastas-heading"
            className="text-xl sm:text-2xl font-semibold tracking-tight text-text-strong text-pretty"
          >
            Vehículos en subasta
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-text-muted num-tab">
            {visible.length} {visible.length === 1 ? 'unidad disponible' : 'unidades disponibles'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Buscar por marca o modelo
            </label>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              name="q"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar marca o modelo…"
              className={
                'h-11 w-full sm:w-64 rounded-lg pl-9 pr-9 text-sm [touch-action:manipulation] ' +
                'bg-bg-elev/60 border border-text-subtle/20 text-text-strong ' +
                'placeholder:text-text-subtle ' +
                'transition-[border-color,background-color] duration-200 ' +
                'hover:border-text-subtle/40 ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                'focus-visible:border-text-strong/40'
              }
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Borrar búsqueda"
                className={
                  'absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md grid place-items-center ' +
                  'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 ' +
                  'transition-colors duration-200 ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
                }
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Filtrar subastas"
            className="inline-flex rounded-lg border border-text-subtle/20 bg-bg-elev/40 p-1 gap-1"
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className={
                    'px-3 h-9 rounded-md text-sm font-medium whitespace-nowrap [touch-action:manipulation] ' +
                    'transition-[background-color,color] duration-200 ' +
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                    (active
                      ? 'bg-text-strong text-bg-base'
                      : 'text-text-muted hover:text-text-strong hover:bg-bg-deep/50')
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-text-subtle/25 bg-bg-elev/30 px-6 py-14 text-center">
          <Gavel
            className="w-8 h-8 mx-auto text-text-subtle opacity-50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-text-strong">
            {filtering ? 'Ningún vehículo coincide con tu búsqueda' : 'No hay subastas activas'}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {filtering
              ? 'Probá con otra marca o quitá los filtros.'
              : 'Volvé pronto o iniciá sesión para recibir avisos de nuevas subastas.'}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
              className={
                'mt-4 inline-flex items-center h-9 px-4 rounded-md text-sm font-medium ' +
                'border border-text-subtle/25 text-text-strong ' +
                'transition-colors duration-200 hover:bg-bg-elev/70 ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
              }
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((a, i) => (
            <li key={a.id} className="min-w-0">
              <PublicAuctionCard locale={locale} auction={a} index={i} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
