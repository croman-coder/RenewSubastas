'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Gavel } from 'lucide-react';
import { closeProgress, pickNextClosing, type HomeStats } from '@/lib/buyer/mobile-home';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { formatClock, remainingLabel } from '@/lib/format/remaining';

interface Props extends HomeStats {
  locale: string;
  /** Para ubicarla en la grilla de dos columnas del Inicio en escritorio (B7). */
  className?: string | undefined;
}

/**
 * "La próxima que cierra" (spec 2026-09-27 §5.2): la única superficie en
 * tinta del Inicio (.panel-ink, como el panel de puja). Cliente porque el
 * reloj corre cada segundo; la elección de la subasta se rehace con cada tic
 * para que una que cierra salga sola y entre la siguiente. Sin ninguna
 * subasta abierta no se muestra.
 */
export function NextClosingCard({
  locale,
  myWinning,
  closingSoon,
  myBidAuctionIds,
  className,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const next = pickNextClosing({ myWinning, closingSoon, myBidAuctionIds }, now);
  if (!next) return null;

  const { item } = next;
  const remaining = item.endsAtMs - now;
  const progress = closeProgress(item.endsAtMs, now);
  // formatDateTimePy da siempre "dd/mm/yyyy HH:MM" en hora de Paraguay; la
  // tarjeta solo necesita la hora.
  const closesAt = formatDateTimePy(locale, item.endsAtMs).slice(-5);

  return (
    <section
      aria-labelledby="next-closing-heading"
      className={
        'panel-ink space-y-4 rounded-2xl border p-5 shadow-card' +
        (className ? ` ${className}` : '')
      }
    >
      <h2
        id="next-closing-heading"
        className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted"
      >
        La próxima que cierra
      </h2>

      <div className="flex items-center gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-bg-deep">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Gavel className="h-6 w-6 text-text-subtle" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold tracking-tight text-text-strong">
            {item.make} {item.model} <span className="num-tab font-normal">{item.year}</span>
          </p>
          {next.kind === 'winning' ? (
            // Dentro del panel en tinta el verde es el de fondo oscuro en los
            // dos temas, igual que el aviso "Vas ganando" de BidPanel.
            <p className="num-tab text-sm font-semibold text-[#bbf7d0]">
              Vas ganando · USD {formatAmount(item.amountUsd)}
            </p>
          ) : (
            <>
              <p className="num-tab text-sm text-text-muted">
                {item.hasBids ? 'Puja actual' : 'Precio inicial'} USD {formatAmount(item.amountUsd)}
              </p>
              <p className="text-xs text-text-muted">
                {item.iBid ? 'Te superaron' : 'Todavía no pujaste'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p
          suppressHydrationWarning
          className="num-tab text-4xl font-extrabold tracking-tight text-text-strong"
        >
          {formatClock(remaining)}
        </p>
        <p suppressHydrationWarning className="num-tab pb-1 text-xs text-text-muted">
          quedan {remainingLabel(remaining)}
        </p>
      </div>

      {/* scaleX y no width: DESIGN.md no anima propiedades de layout. */}
      <div
        suppressHydrationWarning
        role="progressbar"
        aria-label="Tiempo transcurrido de las últimas 24 horas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-text-strong/15"
      >
        <div
          suppressHydrationWarning
          className="h-full origin-left rounded-full bg-text-strong"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span suppressHydrationWarning className="num-tab text-xs text-text-muted">
          Cierra {closesAt}
        </span>
        {/* -my-3 compensa el py-3: el hit area llega a 44 px sin agrandar el
            texto ni empujar el layout de la fila (C3). */}
        <Link
          href={`/${locale}/auctions/${item.auctionId}` as `/${string}`}
          className="-my-3 inline-flex items-center gap-0.5 rounded-md py-3 text-sm font-semibold text-text-strong underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ir a la subasta
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
