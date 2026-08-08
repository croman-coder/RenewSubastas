'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isMetaPixelLoaded, loadMetaPixel, trackMetaPageView } from '@/lib/analytics/meta-pixel';
import { readCookieConsent } from '@/lib/legal/cookie-consent';

/**
 * Reports SPA navigations to the Meta Pixel.
 *
 * The pixel fires its own PageView when it loads, and never again — the App
 * Router swaps pages client-side without a document load, so without this
 * every view after the first would be invisible to Meta.
 *
 * It also owns the retry. loadMetaPixel() refuses to start on a
 * credential-bearing page (the URL is a secret there), so a visitor who
 * already consented and then opens a password-reset link lands with the pixel
 * unloaded. Without this retry it would stay unloaded for the rest of the
 * session. Hence the consent read here — the gate still lives in
 * applyConsent(), this only asks whether it was already passed.
 *
 * The two branches are exclusive on purpose: loadMetaPixel() sends its own
 * first PageView, so tracking as well would double-count that navigation.
 *
 * Renders nothing.
 */
export function MetaPixelRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (readCookieConsent() !== 'accepted') return;
    if (isMetaPixelLoaded()) trackMetaPageView();
    else loadMetaPixel();
  }, [pathname, searchParams]);

  return null;
}
