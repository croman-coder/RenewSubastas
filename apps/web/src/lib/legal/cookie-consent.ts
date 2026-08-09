import { grantMetaConsent } from '@/lib/analytics/meta-pixel';

export type CookieConsent = 'accepted' | 'rejected';

/**
 * Name of the preference cookie.
 *
 * A real cookie rather than localStorage, deliberately: the cookie policy
 * tells the reader we store their choice in a cookie, and a policy that
 * misdescribes its own mechanism is worse than no policy.
 */
export const CONSENT_COOKIE = 'renew_cookie_consent';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function readCookieConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return value === 'accepted' || value === 'rejected' ? value : null;
}

export function writeCookieConsent(value: CookieConsent): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Turn on everything that requires consent.
 *
 * Single entry point on purpose: every non-essential tracker has to be listed
 * here and nowhere else, so "what fires only after the visitor agrees" is one
 * readable list instead of a hunt through the codebase. Called on mount when
 * a stored 'accepted' exists, and the moment someone accepts — so accepting
 * takes effect without a reload.
 *
 * Anything added here must also be disclosed in TWO places: the cookie policy
 * (lib/legal/company-facts.ts) and the banner blurb the visitor actually reads
 * before deciding (components/legal/cookie-banner.tsx). The policy keeps the
 * disclosure truthful; the banner keeps the consent informed. The pixel
 * shipped with only the first updated, and the banner still described error
 * monitoring alone — don't repeat that.
 */
export function applyConsent(): void {
  void enableSentryReplay();
  // The pixel is already installed by this point (MetaPixelRouteTracker
  // bootstraps it for everyone with consent withheld). This releases the
  // queued events — installing and measuring are two separate moments now.
  grantMetaConsent();
}

/**
 * Attach Sentry's Session Replay.
 *
 * Import is dynamic so a visitor who never consents doesn't download the
 * replay bundle at all — gating the integration but still shipping the code
 * would be a hollow opt-in.
 */
export async function enableSentryReplay(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const Sentry = await import('@sentry/nextjs');
    const client = Sentry.getClient();
    if (!client) return;
    if (client.getIntegrationByName?.('Replay')) return;
    client.addIntegration(Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }));
  } catch {
    // Monitoring is best-effort; never let it break the page.
  }
}
