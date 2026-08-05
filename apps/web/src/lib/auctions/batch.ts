export type BatchMode = 'closing' | 'opening';

export interface BatchClock {
  /** Epoch ms the clock counts down to. */
  at: number;
  /** `closing` = the running lote ends; `opening` = the next lote starts. */
  mode: BatchMode;
}

interface ClockItem {
  status: string;
  startsAtMs: number;
  endsAtMs: number;
}

/**
 * What the batch clock should show.
 *
 * A running lote wins: while anything is live, the deadline people care
 * about is when bidding stops. With nothing live but a lote queued, the
 * clock flips to counting toward the opening instead of disappearing —
 * "no hay subastas" reads as "nothing is coming", which is wrong when a
 * lote is scheduled for tomorrow.
 *
 * Lives here rather than next to <BatchCountdown> because that file is
 * `'use client'`: a plain function exported from a client module becomes a
 * client reference when a server component imports it, and calling it on
 * the server throws "is not a function".
 */
export function batchClock(items: ClockItem[]): BatchClock | null {
  const live = items.filter((a) => a.status === 'live' && a.endsAtMs > 0);
  if (live.length > 0) {
    return { at: Math.min(...live.map((a) => a.endsAtMs)), mode: 'closing' };
  }

  const scheduled = items.filter((a) => a.status === 'scheduled' && a.startsAtMs > 0);
  if (scheduled.length > 0) {
    return { at: Math.min(...scheduled.map((a) => a.startsAtMs)), mode: 'opening' };
  }

  return null;
}
