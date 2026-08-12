'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { bootstrapMetaPixel, trackMetaPageView } from '@/lib/analytics/meta-pixel';
import { identifyMetaUser, resetMetaIdentity } from '@/lib/analytics/meta-events';
import { useAuth } from '@/lib/auth/AuthProvider';

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
  const { user } = useAuth();

  useEffect(() => {
    bootstrapMetaPixel();
    trackMetaPageView();
  }, [pathname, searchParams]);

  // Advanced matching. Bidding and registering both happen signed in, so the
  // email is already ours; handing it to Meta lets it attribute a conversion
  // to the ad that caused it even when the browser cookie didn't survive
  // (iOS, blockers). fbevents.js hashes it in the browser before sending, and
  // the cookie/privacy copy names this explicitly — see company-facts.ts.
  //
  // Ordered after the bootstrap effect above so the pixel exists by the time
  // this runs on the first paint; on a credential-bearing page it doesn't,
  // and identifyMetaUser declines rather than queueing against a dead stub.
  //
  // Signing out clears the identity so the next visitor on a shared computer
  // is not measured as the previous one.
  useEffect(() => {
    if (user) identifyMetaUser(user.uid, user.email);
    else resetMetaIdentity();
  }, [user, pathname]);

  return null;
}
