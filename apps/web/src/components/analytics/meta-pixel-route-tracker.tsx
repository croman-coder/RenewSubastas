'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  bootstrapMetaPixel,
  grantMetaConsent,
  isMetaConsentGranted,
  trackMetaPageView,
} from '@/lib/analytics/meta-pixel';
import { readCookieConsent } from '@/lib/legal/cookie-consent';

/**
 * Installs the Meta Pixel and reports SPA navigations to it.
 *
 * Runs on every navigation, and does three things in order of what the visitor
 * has agreed to:
 *
 * 1. Bootstraps the pixel for everyone, with consent withheld. This is what
 *    makes Meta's tooling see the pixel as installed — without it the no-code
 *    event configurator refuses to open no matter how many events consenting
 *    visitors generate. No event is sent until step 2.
 * 2. Grants consent if the visitor already accepted in a previous session, so
 *    accepting once keeps working across visits without a second prompt.
 * 3. Reports the navigation, but only once consent is actually granted.
 *
 * It also owns the retry for credential-bearing pages. The pixel refuses to
 * install on /auth/set-password and /auth/action (the URL is the secret
 * there), so a visitor landing on a reset link starts with no pixel; this
 * picks it up on their next safe navigation.
 *
 * grant and track are exclusive on purpose: grantMetaConsent() sends its own
 * PageView, so tracking as well would double-count that navigation.
 *
 * Renders nothing.
 */
export function MetaPixelRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    bootstrapMetaPixel();
    if (readCookieConsent() !== 'accepted') return;
    if (isMetaConsentGranted()) trackMetaPageView();
    else grantMetaConsent();
  }, [pathname, searchParams]);

  return null;
}
