'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackMetaPageView } from '@/lib/analytics/meta-pixel';

/**
 * Reports SPA navigations to the Meta Pixel.
 *
 * The pixel fires its own PageView when it loads, and never again — the App
 * Router swaps pages client-side without a document load, so without this
 * every view after the first would be invisible to Meta.
 *
 * No consent check here: trackMetaPageView() no-ops unless the pixel was
 * actually loaded, which only happens after the visitor accepts. Keeping the
 * gate in one place (applyConsent) beats re-deriving it per call site.
 *
 * Renders nothing.
 */
export function MetaPixelRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    trackMetaPageView();
  }, [pathname, searchParams]);

  return null;
}
