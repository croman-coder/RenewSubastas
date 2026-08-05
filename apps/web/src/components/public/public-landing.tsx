import Link from 'next/link';
import { Gavel, LogIn, ShieldCheck, Timer } from 'lucide-react';
import { PublicTopbar } from './public-topbar';
import { PublicAuctionsBrowser } from './public-auctions-browser';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { batchClock } from '@/lib/auctions/batch';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  items: PublicAuction[];
}

/**
 * Signed-out landing: the auction catalog IS the page, not a teaser behind a
 * login wall. Only `retail` auctions ever reach here (see the loader call in
 * the route) — wholesale inventory stays invisible to anonymous visitors.
 */
export function PublicLanding({ locale, items }: Props) {
  const liveCount = items.filter((a) => a.status === 'live').length;
  const clock = batchClock(items);

  return (
    <div className="min-h-dvh flex flex-col bg-bg-base">
      <a
        href="#contenido"
        className={
          'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 ' +
          'focus:rounded-md focus:bg-text-strong focus:text-bg-base focus:px-4 focus:py-2 focus:text-sm focus:font-semibold'
        }
      >
        Saltar al contenido
      </a>

      <PublicTopbar locale={locale} />

      <main id="contenido" className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-8 py-6 md:py-8">
        <div className="space-y-8 md:space-y-10">
          <section className="ink-mesh relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/70 via-bg-elev/30 to-transparent px-5 py-7 sm:px-8 sm:py-10">
            <div
              aria-hidden="true"
              className="ink-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black_30%,transparent_75%)] pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-copper/10 blur-3xl pointer-events-none"
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-8">
              <div className="min-w-0 max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-text-subtle/20 bg-bg-base/40 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
                  <span translate="no">Renew</span> · Santa Rosa Automotores
                </span>

                <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-text-strong text-balance">
                  Subastas de vehículos usados certificados
                </h1>
                <p className="mt-3 text-sm sm:text-base text-text-muted max-w-prose text-pretty">
                  Mirá las unidades disponibles y seguí las pujas en tiempo real. Creá tu cuenta
                  para participar.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/${locale}/login` as `/${string}`}
                    className={
                      'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg ' +
                      'bg-text-strong text-bg-base text-sm font-semibold [touch-action:manipulation] ' +
                      'transition-opacity duration-200 hover:opacity-90 ' +
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                      'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
                    }
                  >
                    <LogIn className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                    Iniciar sesión para pujar
                  </Link>
                  <a
                    href="#subastas-heading"
                    className={
                      'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg ' +
                      'border border-text-subtle/25 text-text-strong text-sm font-medium ' +
                      '[touch-action:manipulation] transition-colors duration-200 hover:bg-bg-elev/70 ' +
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
                    }
                  >
                    Ver vehículos
                  </a>
                </div>

                {liveCount > 0 && (
                  <p className="mt-4 inline-flex items-center gap-2 text-sm text-text-muted">
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none"
                    />
                    <span className="num-tab">{liveCount}</span>{' '}
                    {liveCount === 1 ? 'subasta en vivo ahora' : 'subastas en vivo ahora'}
                  </p>
                )}
              </div>

              {/* Batch clock. Every lote closes at the same time, so this is
                  the single most important number on the page. */}
              {clock !== null && (
                <BatchCountdown
                  endsAtMs={clock.at}
                  mode={clock.mode}
                  className="w-full lg:w-[24rem]"
                />
              )}

              <ul className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 shrink-0 lg:w-64">
                <Feature
                  icon={ShieldCheck}
                  title="Unidades certificadas"
                  desc="Revisadas por Santa Rosa"
                />
                <Feature
                  icon={Timer}
                  title="Precios en vivo"
                  desc="Pujas actualizadas al segundo"
                />
                <Feature icon={Gavel} title="Adjudicación clara" desc="Reglas y plazos públicos" />
              </ul>
            </div>
          </section>

          <PublicAuctionsBrowser locale={locale} items={items} />
        </div>
      </main>

      <footer className="mt-10 border-t border-text-subtle/15">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-muted">
          <p>
            <span translate="no">Renew Subastas</span> · Santa Rosa Paraguay S.A.
          </p>
          <Link
            href={`/${locale}/login` as `/${string}`}
            className="hover:text-text-strong transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 rounded"
          >
            Iniciar sesión
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Gavel; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-text-subtle/15 bg-bg-base/30 px-3.5 py-3">
      <span className="shrink-0 w-9 h-9 rounded-lg bg-text-strong/[0.07] ring-1 ring-text-subtle/20 grid place-items-center text-text-strong">
        <Icon className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-strong leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted leading-snug">{desc}</p>
      </div>
    </li>
  );
}
