'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Gavel, LogIn } from 'lucide-react';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
import { SoldBanner } from '@/components/auctions/sold-banner';
import { isSoldOutcome } from '@/lib/auctions/sold-outcome';

interface Props {
  locale: string;
  auction: PublicAuction;
  index?: number;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  live: { label: 'En vivo', cls: 'bg-emerald-500/90 text-white ring-emerald-400/30' },
  scheduled: { label: 'Programada', cls: 'bg-amber-500/90 text-white ring-amber-400/30' },
  ended: { label: 'Finalizada', cls: 'bg-zinc-700/85 text-zinc-200 ring-zinc-500/30' },
  cancelled: { label: 'Cancelada', cls: 'bg-rose-600/90 text-white ring-rose-400/30' },
};

const usd = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

/**
 * Auction card for signed-out visitors.
 *
 * Mirrors the authenticated `AuctionCard` visually, minus the favorite
 * toggle (writing a favorite needs a uid) and with every affordance routed
 * through `/login?from=…` so the visitor lands on the auction they actually
 * clicked once signed in. Kept as its own component rather than making the
 * authenticated card's props nullable: the two differ in what they *do*, not
 * just in what they show, and threading `buyerUid?: string` through the
 * favorite handler is how you end up shipping a no-op heart button.
 */
export function PublicAuctionCard({ locale, auction, index = 0 }: Props) {
  // Real clock, so the SERVER renders the true remaining time. Seeding from
  // endsAtMs to force matching markup makes SSR emit "—" on every card until
  // hydration. Sub-second drift is absorbed by suppressHydrationWarning below
  // — same approach as the authenticated AuctionCard.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = auction.endsAtMs - now;
  const displayPrice = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;
  const isUrgent = remainingMs > 0 && remainingMs < 60 * 60 * 1000;
  const isLive = auction.status === 'live';
  const status = STATUS[auction.status] ?? STATUS['ended']!;

  const title = `${auction.make} ${auction.model} ${auction.year}`;
  const loginHref = `/${locale}/login?from=${encodeURIComponent(`/${locale}/auctions/${auction.id}`)}`;
  // Single source of truth for every sold-state branch on this card (the
  // banner, the CTA swap, and the overlay's accessible name) — three
  // separately-evaluated copies of this condition is how one of them
  // silently drifts from the other two.
  const isSold = isSoldOutcome(auction.outcome);
  // The overlay is the only focusable element on a sold card (the CTA below
  // becomes plain text), so its accessible name is the *entire* experience
  // for keyboard/screen-reader users here. Announcing "iniciar sesión para
  // pujar" on a unit that's sold told them to go bid on something that no
  // longer takes bids.
  const overlayAriaLabel = isSold ? `${title} — vendido` : `${title} — iniciar sesión para pujar`;

  return (
    <article
      className={
        'sheen group relative flex flex-col rounded-xl overflow-hidden border border-text-subtle/15 ' +
        'bg-bg-elev/40 ' +
        'transition-[border-color,background-color,transform,box-shadow] duration-300 ' +
        'hover:border-text-strong/40 hover:bg-bg-elev/70 ' +
        'hover:-translate-y-1 hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,0.55)] ' +
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
        'animate-in fade-in slide-in-from-bottom-2 duration-300'
      }
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms`, animationFillMode: 'both' }}
    >
      {/* Full-card overlay link. A signed-out visitor has no auction detail to
          reach, so it goes to login carrying `from` — after signing in they
          land on the car they clicked, not a generic home. Real <Link>, so
          Cmd/middle-click still work. */}
      <Link
        href={loginHref as `/${string}`}
        aria-label={overlayAriaLabel}
        className={
          'absolute inset-0 z-0 rounded-xl [touch-action:manipulation] ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
        }
      />

      <div className="relative z-[1] aspect-[4/3] bg-bg-deep overflow-hidden pointer-events-none">
        {/* Plain <img>, matching the authenticated AuctionCard: vehicle photos
            come from a per-environment Firebase Storage bucket that next/image
            would need allow-listed per deploy. width/height are set so the box
            is reserved before load (no CLS). */}
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            width={640}
            height={480}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle">
            <Gavel className="w-8 h-8 opacity-40" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 via-black/15 to-transparent"
        />
        {isSold && <SoldBanner variant="card" />}
        <span
          className={
            'absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 ' +
            'text-[11px] font-semibold ring-1 backdrop-blur-md ' +
            status.cls
          }
        >
          {isLive && (
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-white animate-pulse motion-reduce:animate-none"
            />
          )}
          {status.label}
        </span>
        <span
          suppressHydrationWarning
          className={
            'absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 ' +
            'rounded-md px-2 py-1 text-xs font-medium num-tab backdrop-blur-md ' +
            (isUrgent ? 'bg-rose-500/90 text-white' : 'bg-black/55 text-white ring-1 ring-white/10')
          }
        >
          <Clock className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">Tiempo restante:</span>
          {formatRemaining(remainingMs)}
        </span>
      </div>

      <div className="relative z-[1] flex flex-col flex-1 p-3.5 gap-3">
        <div className="space-y-2 pointer-events-none min-w-0">
          <h3 className="font-medium text-text-strong tracking-tight truncate">
            {auction.make} {auction.model}{' '}
            <span className="num-tab text-text-muted font-normal">{auction.year}</span>
          </h3>
          <div className="flex items-end justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.06em] text-text-muted">
                {auction.currentBid > 0 ? 'Puja actual' : 'Precio inicial'}
              </p>
              <p
                className={
                  'text-lg font-semibold num-tab tracking-tight truncate ' +
                  (isLive ? 'text-text-strong' : 'text-text-muted')
                }
              >
                USD&nbsp;{usd.format(displayPrice)}
              </p>
            </div>
            {/* Hidden at zero, matching auction-card.tsx: "Precio inicial"
                already conveys it, and "0 pujas" on every card of a
                just-opened lote reads as a dead catalogue. */}
            {auction.bidCount > 0 && (
              <span className="text-[11px] text-text-muted shrink-0 num-tab">
                {auction.bidCount} {auction.bidCount === 1 ? 'puja' : 'pujas'}
              </span>
            )}
          </div>
        </div>

        {/* Above the overlay link so it's its own tab stop and reads as the
            primary action. Both lead to login; this one names the intent. */}
        {isSold ? (
          <p className="relative z-[2] mt-auto w-full text-center text-sm text-text-muted">
            Ya no disponible
          </p>
        ) : (
          <Link
            href={loginHref as `/${string}`}
            className={
              'relative z-[2] mt-auto w-full inline-flex items-center justify-center gap-1.5 ' +
              'h-11 rounded-md [touch-action:manipulation] ' +
              'bg-text-strong text-bg-base text-sm font-semibold ' +
              'transition-opacity duration-200 hover:opacity-90 ' +
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
              'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
            }
          >
            <LogIn className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
            Pujar
          </Link>
        )}
      </div>
    </article>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}
