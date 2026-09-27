import { formatAmount } from '@/lib/format/money';

/**
 * Estado propio del comprador en cada subasta (spec 2026-09-27 §5.3, §5.5, §6).
 *
 * Mira quién va primero en la subasta (`iAmLeading`, que listMyBids saca de
 * `auction.currentBidderUid`) y no el `status` guardado en la puja: las pujas
 * viejas y las del seed de demo no lo tienen y salían todas como 'valid'.
 * currentBidderUid es la misma fuente que usa BidPanel para "vas ganando".
 */
export type MyAuctionState = 'winning' | 'outbid';
export type BidOutcome = 'winning' | 'outbid' | 'won' | 'lost';

export interface BidOutcomeInput {
  auctionStatus: 'scheduled' | 'live' | 'ended' | 'cancelled';
  iAmLeading: boolean;
  iAmWinner: boolean;
}

export function bidOutcome(entry: BidOutcomeInput): BidOutcome | null {
  if (entry.auctionStatus === 'live') return entry.iAmLeading ? 'winning' : 'outbid';
  if (entry.auctionStatus === 'ended') return entry.iAmWinner ? 'won' : 'lost';
  return null;
}

/** Solo subastas en vivo: es lo que el catálogo marca con "Vas ganando"/"Te superaron". */
export function myAuctionStates(
  entries: ReadonlyArray<BidOutcomeInput & { auctionId: string }>,
): Map<string, MyAuctionState> {
  const states = new Map<string, MyAuctionState>();
  for (const e of entries) {
    if (states.has(e.auctionId)) continue;
    const outcome = bidOutcome(e);
    if (outcome === 'winning' || outcome === 'outbid') states.set(e.auctionId, outcome);
  }
  return states;
}

export interface OwnStatePill {
  variant: 'success' | 'danger' | 'info' | 'neutral';
  label: string;
}

/**
 * La píldora de la fila y la tarjeta del catálogo. "Compra ya" solo en vivo:
 * en una programada todavía no se puede comprar, y prometerlo sería mentir.
 * Con pujas de otros y sin estado propio no se muestra nada: el precio ya
 * dice "Puja actual".
 */
export function ownStatePill(
  state: MyAuctionState | undefined,
  auction: {
    status: 'scheduled' | 'live' | 'ended' | 'cancelled';
    bidCount: number;
    buyNowPrice: number | null;
  },
): OwnStatePill | null {
  if (state === 'winning') return { variant: 'success', label: 'Vas ganando' };
  if (state === 'outbid') return { variant: 'danger', label: 'Te superaron' };
  if (auction.status !== 'live' && auction.status !== 'scheduled') return null;
  if (auction.bidCount > 0) return null;
  if (auction.status === 'live' && auction.buyNowPrice !== null) {
    return { variant: 'info', label: `Compra ya USD ${formatAmount(auction.buyNowPrice)}` };
  }
  return { variant: 'neutral', label: 'Sin pujas' };
}
