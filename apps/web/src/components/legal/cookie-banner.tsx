'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import {
  readCookieConsent,
  writeCookieConsent,
  enableSentryReplay,
  type CookieConsent,
} from '@/lib/legal/cookie-consent';

interface Props {
  locale: string;
}

/** Fired by the footer button so a visitor can revisit their choice. */
export const REOPEN_EVENT = 'renew:cookie-preferences';

/**
 * Cookie notice with a genuine reject.
 *
 * Rejecting is not cosmetic: it withholds Sentry Session Replay, the only
 * non-essential tracking here. The session cookie stays either way — it is
 * strictly necessary to keep someone logged in, so it isn't consent-gated,
 * and the policy says so plainly.
 *
 * Renders nothing until mounted so the server never guesses at a choice it
 * cannot read, which would flash the banner at visitors who already decided.
 */
export function CookieBanner({ locale }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const existing = readCookieConsent();
    if (existing === 'accepted') void enableSentryReplay();
    if (existing === null) setOpen(true);

    const reopen = () => setOpen(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  function decide(value: CookieConsent) {
    writeCookieConsent(value);
    if (value === 'accepted') void enableSentryReplay();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className={
        'fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 ' +
        'pb-[max(0.75rem,env(safe-area-inset-bottom))] ' +
        'animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none'
      }
    >
      <div
        className={
          'mx-auto max-w-3xl rounded-2xl border border-text-subtle/20 ' +
          'bg-bg-elev/95 backdrop-blur shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] ' +
          'px-4 py-4 sm:px-5 sm:py-4'
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="shrink-0 w-9 h-9 rounded-lg bg-text-strong/[0.07] ring-1 ring-text-subtle/20 grid place-items-center text-text-strong">
              <Cookie className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p id="cookie-title" className="text-sm font-semibold text-text-strong">
                Usamos cookies
              </p>
              <p id="cookie-desc" className="mt-0.5 text-sm text-text-muted text-pretty">
                Las necesarias para mantener tu sesión son imprescindibles. Además, con tu permiso
                registramos fallas técnicas para poder corregirlas.{' '}
                <Link
                  href={`/${locale}/cookies` as `/${string}`}
                  className="underline underline-offset-2 hover:text-text-strong transition-colors duration-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
                >
                  Leer la política
                </Link>
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => decide('accepted')}
              className={
                'flex-1 sm:flex-none h-11 px-5 rounded-lg text-sm font-semibold ' +
                'bg-text-strong text-bg-base [touch-action:manipulation] ' +
                'transition-opacity duration-200 hover:opacity-90 ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev'
              }
            >
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => decide('rejected')}
              className={
                'flex-1 sm:flex-none h-11 px-5 rounded-lg text-sm font-medium ' +
                'border border-text-subtle/25 text-text-strong [touch-action:manipulation] ' +
                'transition-colors duration-200 hover:bg-bg-deep/50 ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
              }
            >
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
