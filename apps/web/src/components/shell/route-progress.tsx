'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Top-of-page progress bar that gives users immediate visual feedback when a
 * server-rendered route is loading.
 *
 * Implementation notes:
 *   - Next.js doesn't expose a "navigation start" event, so we hook into link
 *     clicks at the document level via capture phase. Any anchor that targets
 *     the same origin and isn't modifier-clicked counts as a navigation start.
 *   - The bar fakes progress with an exponential ease toward 90% so the user
 *     keeps seeing motion even when the server is taking longer than usual,
 *     then snaps to 100% the moment the new pathname/search params land.
 *   - Hides itself ~250 ms after completion so the transition out feels
 *     deliberate rather than a flash.
 *
 * No external dependency (NProgress / ant-design) — keeps the bundle lean.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const animTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for link clicks anywhere on the page and start the bar.
  useEffect(() => {
    function shouldTrack(target: HTMLAnchorElement): boolean {
      if (!target.href) return false;
      const url = new URL(target.href, window.location.href);
      // External link, new tab, or same-page anchor — let the browser handle.
      if (url.origin !== window.location.origin) return false;
      if (target.target && target.target !== '_self') return false;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return false;
      }
      // Files served directly (favicon, images) shouldn't trigger the bar.
      if (/\.(png|jpe?g|gif|svg|ico|pdf|zip)$/i.test(url.pathname)) return false;
      return true;
    }

    function onClick(e: MouseEvent) {
      // Modifier keys = open in new tab/window or download — leave alone.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      let el: HTMLElement | null = e.target as HTMLElement;
      while (el && el !== document.body) {
        if (el instanceof HTMLAnchorElement) {
          if (shouldTrack(el)) start();
          return;
        }
        el = el.parentElement;
      }
    }

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
    // start/finish are stable refs created below
    // start/finish are stable refs — listing them as deps would cause re-binds.
  }, []);

  // Whenever the route changes (pathname or query), the navigation completed.
  useEffect(() => {
    finish();
    // start/finish are stable refs — listing them as deps would cause re-binds.
  }, [pathname, search]);

  function start() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (animTimer.current) clearInterval(animTimer.current);
    setVisible(true);
    setProgress(8);
    animTimer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        // Slow exponential approach to 90: faster at start, glacial near 90.
        const remaining = 90 - p;
        return p + Math.max(0.5, remaining * 0.07);
      });
    }, 180);
  }

  function finish() {
    if (animTimer.current) {
      clearInterval(animTimer.current);
      animTimer.current = null;
    }
    setProgress(100);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
  }

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-0.5 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease-out' }}
    >
      <div
        className="h-full bg-gradient-to-r from-copper via-copper/80 to-copper shadow-[0_0_8px_rgba(205,155,79,0.6)]"
        style={{
          width: `${progress}%`,
          transition: visible ? 'width 200ms cubic-bezier(0.22, 1, 0.36, 1)' : 'width 0ms',
        }}
      />
    </div>
  );
}
