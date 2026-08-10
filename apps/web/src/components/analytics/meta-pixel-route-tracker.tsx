'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { bootstrapMetaPixel, trackMetaPageView } from '@/lib/analytics/meta-pixel';

/**
 * Installs the Meta Pixel and reports SPA navigations to it.
 *
 * Runs on every navigation, for every visitor. The pixel used to wait for the
 * cookie banner; it no longer does — the business chose full advertising
 * coverage over consent-gated measurement, and the published cookie and
 * privacy copy was rewritten in the same change to say so.
 *
 * The banner still governs Sentry Session Replay, so rejecting is not a no-op
 * — it just no longer affects Meta.
 *
 * The bootstrap is idempotent, so calling it on every navigation costs
 * nothing after the first. It also owns the retry for credential-bearing
 * pages: the pixel refuses to install on /auth/set-password and /auth/action
 * (the URL is the secret there), so a visitor landing on a reset link starts
 * with no pixel and picks it up on their next safe navigation.
 *
 * Renders nothing.
 */
export function MetaPixelRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    bootstrapMetaPixel();
    trackMetaPageView();
  }, [pathname, searchParams]);

  return null;
}
