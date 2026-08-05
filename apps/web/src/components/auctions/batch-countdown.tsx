'use client';
import { useEffect, useState } from 'react';
import { Clock, Hourglass } from 'lucide-react';
import type { BatchMode } from '@/lib/auctions/batch';

interface Props {
  /** Epoch ms the clock counts down to. */
  endsAtMs: number;
  /** `closing` (default) counts to the end of the running lote; `opening` to the start of the next. */
  mode?: BatchMode;
  className?: string;
}

/**
 * Large, centred countdown for the whole batch.
 *
 * Vehicles are listed in lotes that all share one time, so a single
 * prominent clock is more useful than reading it off each card. Per-card
 * countdowns stay as-is: they're still correct, and a lote can be split.
 *
 * Two modes. `closing` is the running lote's deadline. `opening` counts to
 * the next lote's start, so a queued batch still shows a clock instead of
 * the surface reading as empty.
 *
 * Seeded with the real clock so the SERVER renders the true remaining time.
 * Seeding with `endsAtMs` instead (to force identical server/client markup)
 * makes `remaining` 0 during SSR, so the delivered HTML reads "Lote cerrado"
 * until hydration repaints it — wrong for crawlers, and a visible flash on a
 * slow connection. The sub-second server/client difference is absorbed with
 * `suppressHydrationWarning` on the digits, which is what it exists for.
 * Same approach as the per-card timer in AuctionCard.
 */
export function BatchCountdown({ endsAtMs, mode = 'closing', className = '' }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const opening = mode === 'opening';
  const remaining = Math.max(0, endsAtMs - now);
  const done = remaining <= 0;

  const totalSec = Math.floor(remaining / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  // Under an hour the batch is about to close — pull the eye without
  // animating (a pulsing 40px clock is genuinely distracting). Only for
  // `closing`: an imminent opening is good news, and red reads as danger.
  const urgent = !opening && !done && remaining < 60 * 60 * 1000;

  const heading = done
    ? opening
      ? 'Abriendo…'
      : 'Lote cerrado'
    : opening
      ? 'Comienza en'
      : 'Tiempo restante';

  const label = done
    ? opening
      ? 'El lote está por abrir'
      : 'Subastas cerradas'
    : `${opening ? 'Comienza en' : 'Tiempo restante'}: ${d} días, ${h} horas, ${m} minutos, ${s} segundos`;

  return (
    <div
      className={
        'relative overflow-hidden rounded-2xl border px-5 py-4 text-center ' +
        'transition-colors duration-300 ' +
        (urgent ? 'border-rose-500/40 bg-rose-500/[0.07]' : 'border-text-subtle/20 bg-bg-base/50') +
        (className ? ` ${className}` : '')
      }
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-16 h-32 bg-[radial-gradient(ellipse_50%_100%_at_50%_100%,rgba(255,255,255,0.10),transparent_70%)] pointer-events-none"
      />

      <p
        suppressHydrationWarning
        className={
          'relative inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold ' +
          'uppercase tracking-[0.18em] ' +
          (urgent ? 'text-rose-300' : 'text-text-muted')
        }
      >
        {opening ? (
          <Hourglass className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Clock className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
        )}
        {heading}
      </p>

      {/* One accessible string; the digits themselves are decorative so a
          screen reader doesn't read "0 7 d 0 4 h" character by character. */}
      <p className="sr-only" aria-live="off" suppressHydrationWarning>
        {label}
      </p>

      <div
        aria-hidden="true"
        suppressHydrationWarning
        className="relative mt-1.5 flex items-baseline justify-center gap-2 sm:gap-3"
      >
        {done ? (
          <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-text-muted">
            —
          </span>
        ) : (
          <>
            {/* Days are demoted: a lote runs for a week, so the day figure
                barely moves and stealing size from it makes the hours — the
                number people actually watch — read as the headline. Hidden
                entirely at 0 days rather than shown as a dead "00". */}
            {d > 0 && <Unit value={d} unit="d" urgent={urgent} size="sm" />}
            <Unit value={h} unit="h" urgent={urgent} />
            <Unit value={m} unit="m" urgent={urgent} />
            <Unit value={s} unit="s" urgent={urgent} />
          </>
        )}
      </div>
    </div>
  );
}

function Unit({
  value,
  unit,
  urgent,
  size = 'lg',
}: {
  value: number;
  unit: string;
  urgent: boolean;
  size?: 'sm' | 'lg';
}) {
  const small = size === 'sm';
  return (
    <span className="inline-flex items-baseline">
      <span
        // MUST be on this element, not an ancestor: suppressHydrationWarning
        // applies to the node's own text/attributes and does NOT cascade to
        // descendants. With it only on the wrapper, the seconds digit still
        // mismatched (server 39 / client 38), React treated it as a failed
        // hydration and replaced the whole document with a client render —
        // it logged "the server HTML was replaced with client content in
        // #document" on every page carrying the clock.
        suppressHydrationWarning
        className={
          'num-tab font-semibold tracking-tight tabular-nums leading-none ' +
          (small ? 'text-xl sm:text-2xl lg:text-3xl ' : 'text-4xl sm:text-5xl lg:text-6xl ') +
          (urgent
            ? small
              ? 'text-rose-200/70'
              : 'text-rose-200'
            : small
              ? 'text-text-muted'
              : 'text-text-strong')
        }
        style={small ? undefined : { textShadow: '0 0 28px rgba(255,255,255,0.18)' }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span
        className={
          'ml-0.5 font-medium ' +
          (small ? 'text-[10px] sm:text-xs ' : 'text-xs sm:text-sm ') +
          (urgent ? 'text-rose-300/80' : 'text-text-muted')
        }
      >
        {unit}
      </span>
    </span>
  );
}
