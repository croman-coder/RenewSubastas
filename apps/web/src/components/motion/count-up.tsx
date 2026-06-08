'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 (or `from`) to `value` once when the element
 * scrolls into view. Uses an ease-out cubic curve so the count slows as
 * it approaches the final value — feels like a number "settling" rather
 * than ticking. Respects prefers-reduced-motion (paints the final value
 * directly).
 *
 * Locale-aware formatting via Intl.NumberFormat so dashboard tiles
 * match the rest of the app's number style (1.234 vs 1,234 etc.).
 */
export function CountUp({
  value,
  from = 0,
  durationMs = 900,
  locale = 'es-PY',
  prefix = '',
  suffix = '',
  // Optional thousands grouping. Pass `false` for raw digits (auction
  // counts), `true` for currency-like numbers.
  group = true,
}: {
  value: number;
  from?: number;
  durationMs?: number;
  locale?: string;
  prefix?: string;
  suffix?: string;
  group?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState<number>(from);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function paintFinal() {
      setCurrent(value);
    }

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      paintFinal();
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paintFinal();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            io.disconnect();
            const start = performance.now();
            const span = value - from;
            // ease-out cubic
            const ease = (t: number) => 1 - Math.pow(1 - t, 3);
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / durationMs);
              const v = from + span * ease(t);
              setCurrent(v);
              if (t < 1) requestAnimationFrame(tick);
              else setCurrent(value); // snap to exact target
            };
            requestAnimationFrame(tick);
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, from, durationMs]);

  const fmt = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: group,
  });

  return (
    <span ref={ref} className="num-tab">
      {prefix}
      {fmt.format(Math.round(current))}
      {suffix}
    </span>
  );
}
