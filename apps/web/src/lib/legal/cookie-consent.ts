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
 * Attach Sentry's Session Replay, which is the only non-essential tracking on
 * the site. Called from the Sentry client config on load when consent already
 * exists, and from the banner the moment the visitor accepts, so accepting
 * takes effect without a reload.
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
