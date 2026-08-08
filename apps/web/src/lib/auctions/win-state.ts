export interface WinStateInput {
  /** Auction is over — status is 'ended'/'cancelled', or the clock ran out. */
  ended: boolean;
  outcome: string | null;
  winnerUid: string | null;
  myUid: string;
}

/**
 * Whether *this* buyer is the adjudicated winner of a closed auction.
 *
 * Deliberately NOT derived from `currentBidderUid` ("highest bidder while the
 * auction runs"). The only authoritative record of a platform sale is
 * `outcome === 'sold'` + `winnerUid`, both written atomically by
 * `closeAuctionAsSold` (buyNow and the scheduled tick both call it, and
 * nothing else does). Every other way an auction closes — sold in the
 * showroom, reserve not met, no bids, cancelled — must read as "you did not
 * win" for every bidder, including whoever was on top when it closed.
 * Bug this replaces: `currentBidderUid === myUid` stayed true through a
 * `sold_offline` close (nothing clears it on that path except a targeted
 * patch elsewhere), so the previously-leading bidder was told "¡Ganaste!"
 * for a unit sold to someone else in the showroom.
 */
export function didBuyerWinAuction({ ended, outcome, winnerUid, myUid }: WinStateInput): boolean {
  return ended && outcome === 'sold' && winnerUid === myUid;
}
