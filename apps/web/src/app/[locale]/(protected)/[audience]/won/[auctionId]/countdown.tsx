'use client';
import { useEffect, useState } from 'react';

/**
 * Live countdown for the payment deadline. Renders D:HH:MM:SS until it
 * hits zero, then collapses to a plain "Plazo vencido" state — the
 * server will sweep the auction to `forfeited` on the next tick, so we
 * don't try to be cute and re-fetch from the client.
 *
 * The initial render uses the difference between deadlineMs and the
 * client's clock, so SSR doesn't ship a stale string that flickers
 * mid-render.
 */
export function Countdown({ deadlineMs, locale }: { deadlineMs: number; locale: string }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, deadlineMs - now);
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const expired = remaining === 0;

  const deadlineLabel = new Date(deadlineMs).toLocaleString(locale, {
    timeZone: 'America/Asuncion',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (expired) {
    return (
      <p className="text-sm text-danger font-medium">
        El plazo venció el {deadlineLabel}. La adjudicación está siendo liberada.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md">
        <Cell value={days} label="Días" />
        <Cell value={hours} label="Horas" pad />
        <Cell value={minutes} label="Min" pad />
        <Cell value={seconds} label="Seg" pad />
      </div>
      <p className="text-xs text-text-muted">Plazo final: {deadlineLabel} (hora Paraguay)</p>
    </div>
  );
}

function Cell({ value, label, pad = false }: { value: number; label: string; pad?: boolean }) {
  const display = pad ? value.toString().padStart(2, '0') : value.toString();
  return (
    <div className="rounded-xl bg-bg-deep/50 ring-1 ring-text-subtle/15 px-3 py-2.5 text-center">
      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-text-strong num-tab leading-none">
        {display}
      </p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted mt-1">{label}</p>
    </div>
  );
}
