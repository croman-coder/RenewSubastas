/**
 * Closing time for the current batch: the soonest `endsAt` among auctions
 * that are actually running. Returns null when nothing is live, so callers
 * can omit the clock rather than render a frozen zero.
 *
 * Lives here rather than next to <BatchCountdown> on purpose: that file is
 * `'use client'`, and a plain function exported from a client module becomes
 * a client reference when a server component imports it — calling it on the
 * server throws "is not a function". Pure helpers shared across the boundary
 * have to sit in a module with no directive.
 */
export function batchEndsAt(items: Array<{ status: string; endsAtMs: number }>): number | null {
  const live = items.filter((a) => a.status === 'live' && a.endsAtMs > 0);
  if (live.length === 0) return null;
  return Math.min(...live.map((a) => a.endsAtMs));
}
