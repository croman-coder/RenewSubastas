'use client';
import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';

const THROTTLE_MS = 30 * 60_000; // one logged view per auction per 30 min per tab session

/**
 * Invisible view logger for the auction detail page. Fire-and-forget: any
 * failure is swallowed — tracking must never affect the buyer experience.
 * sessionStorage throttling keeps reloads/navigation from inflating counts;
 * the callable additionally rate-limits server-side.
 */
export function ViewTracker({ auctionId }: { auctionId: string }) {
  useEffect(() => {
    const key = `renew:view:${auctionId}`;
    try {
      const last = Number(window.sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < THROTTLE_MS) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // private browsing — still log, just without throttle persistence
    }
    httpsCallable(
      fb.functions,
      'logAuctionView',
    )({ auctionId }).catch((err) => {
      console.warn('[view-tracker] failed', err);
    });
  }, [auctionId]);

  return null;
}
