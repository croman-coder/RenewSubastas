'use client';
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  /** Epoch ms when the current batch closes. */
  endsAtMs: number;
  className?: string;
}

/**
 * Large, centred countdown for the whole batch.
 *
 * Vehicles are listed in lotes that all share one closing time, so a single
 * prominent clock is more useful than reading it off each card. Per-card
 * countdowns stay as-is: they're still correct, and a lote can be split.
 *
 * Uses `endsAtMs` as the initial `now` so the server render and the first
 * client render produce identical markup — seeding with the real clock
 * hydration-mismatches every digit.
 */
export function BatchCountdown({ endsAtMs, className = '' }: Props) {
  const [now, setNow] = useState(endsAtMs);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, endsAtMs - now);
  const done = remaining <= 0;

  const totalSec = Math.floor(remaining / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  // Under an hour the batch is about to close — pull the eye without
  // animating (a pulsing 40px clock is genuinely distracting).
  const urgent = !done && remaining < 60 * 60 * 1000;

  const label = done
    ? 'Subastas cerradas'
    : `Tiempo restante: ${d} días, ${h} horas, ${m} minutos, ${s} segundos`;

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
        className={
          'relative inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold ' +
          'uppercase tracking-[0.18em] ' +
          (urgent ? 'text-rose-300' : 'text-text-muted')
        }
      >
        <Clock className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
        {done ? 'Lote cerrado' : 'Tiempo restante'}
      </p>

      {/* One accessible string; the digits themselves are decorative so a
          screen reader doesn't read "0 7 d 0 4 h" character by character. */}
      <p className="sr-only" aria-live="off">
        {label}
      </p>

      <div
        aria-hidden="true"
        className="relative mt-1.5 flex items-baseline justify-center gap-2 sm:gap-3"
      >
        {done ? (
          <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-text-muted">
            —
          </span>
        ) : (
          <>
            <Unit value={d} unit="d" urgent={urgent} />
            <Unit value={h} unit="h" urgent={urgent} />
            <Unit value={m} unit="m" urgent={urgent} />
            <Unit value={s} unit="s" urgent={urgent} />
          </>
        )}
      </div>
    </div>
  );
}

function Unit({ value, unit, urgent }: { value: number; unit: string; urgent: boolean }) {
  return (
    <span className="inline-flex items-baseline">
      <span
        className={
          'num-tab font-semibold tracking-tight tabular-nums ' +
          'text-4xl sm:text-5xl lg:text-6xl leading-none ' +
          (urgent ? 'text-rose-200' : 'text-text-strong')
        }
        style={{ textShadow: '0 0 28px rgba(255,255,255,0.18)' }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span
        className={
          'ml-0.5 text-xs sm:text-sm font-medium ' +
          (urgent ? 'text-rose-300/80' : 'text-text-muted')
        }
      >
        {unit}
      </span>
    </span>
  );
}
