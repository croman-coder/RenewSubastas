'use client';
import { useEffect, useState } from 'react';
import { formatLongDatePy } from '@/lib/format/date';

/**
 * Client-rendered "today" eyebrow. We had this as a server-rendered string,
 * but Next App Router caches the RSC payload across soft navigations — so a
 * user who opened the wholesale dashboard yesterday and came back today
 * still saw yesterday's date until a hard reload. Rendering on the client
 * with `new Date()` at mount time guarantees the date is correct on every
 * mount, and the daily ticker keeps it fresh if the tab stays open across
 * midnight.
 */
export function TodayLabel({ locale, className }: { locale: string; className?: string }) {
  const [today, setToday] = useState(() => formatLongDatePy(locale));

  useEffect(() => {
    // Compute the next midnight in PY time and reschedule once per day. We
    // use a fresh setTimeout each tick instead of setInterval(86400_000) so
    // any clock drift or laptop-sleep doesn't accumulate.
    let timer: ReturnType<typeof setTimeout> | null = null;
    function scheduleNext() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 30, 0); // 30s past midnight, defensive
      const ms = tomorrow.getTime() - now.getTime();
      timer = setTimeout(() => {
        setToday(formatLongDatePy(locale));
        scheduleNext();
      }, ms);
    }
    setToday(formatLongDatePy(locale)); // also re-sync on every mount
    scheduleNext();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [locale]);

  return <span className={className}>{today}</span>;
}
