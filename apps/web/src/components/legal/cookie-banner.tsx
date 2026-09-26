'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import {
  readCookieConsent,
  writeCookieConsent,
  applyConsent,
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
 * Rejecting is not cosmetic: it withholds both non-essential trackers —
 * Sentry Session Replay and the Meta Pixel. The session cookie stays either
 * way — it is strictly necessary to keep someone logged in, so it isn't
 * consent-gated, and the policy says so plainly.
 *
 * The blurb below must name every category applyConsent() turns on. Consent
 * to "error monitoring" is not consent to advertising measurement, so adding
 * a tracker there without amending this text collects a consent nobody gave.
 *
 * Server-rendered open, so it paints with the first HTML instead of seconds
 * later after hydration (it was the landing's LCP at 5,9 s on mobile,
 * auditoría 2026-09-26). Visitors who already decided never see it: the
 * <head> script from consentFlagScript() flags <html> before the first paint
 * and globals.css hides #cookie-banner under that flag; the effect below then
 * removes it for good. No entrance animation on that first render — fading
 * in from opacity 0 would delay the very paint this is meant to speed up. It
 * animates only when reopened from the footer.
 */
export function CookieBanner({ locale }: Props) {
  const [open, setOpen] = useState(true);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const existing = readCookieConsent();
    if (existing === 'accepted') applyConsent();
    if (existing !== null) setOpen(false);

    const reopen = () => {
      setReopened(true);
      setOpen(true);
      // The flag would keep a reopened banner hidden.
      delete document.documentElement.dataset['cookieConsent'];
    };
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  function decide(value: CookieConsent) {
    writeCookieConsent(value);
    if (value === 'accepted') applyConsent();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      id="cookie-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className={
        'fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 ' +
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]' +
        (reopened
          ? ' animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none'
          : '')
      }
    >
      <div
        className={
          'mx-auto max-w-3xl rounded-2xl border border-text-subtle/20 ' +
          'bg-bg-elev shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] ' +
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
                Las necesarias para mantener tu sesión son imprescindibles. En todas las visitas
                medimos el uso del sitio y el resultado de nuestros anuncios. Y, con tu permiso,
                registramos además fallas técnicas para poder corregirlas.{' '}
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
