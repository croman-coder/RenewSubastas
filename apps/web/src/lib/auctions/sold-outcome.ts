/**
 * Whether an auction's `outcome` represents a genuine sale — closed on the
 * platform (`sold`) or in the showroom (`sold_offline`). A unit that sold is
 * one fact; a lot that closed with no buyer (`reserve_not_met`, `no_bids`) is
 * a different one, and conflating them is exactly the class of bug this
 * guards against.
 *
 * This exact `outcome === 'sold' || outcome === 'sold_offline'` expression
 * was independently re-typed in bid-panel.tsx, auction-card.tsx,
 * public-auction-card.tsx and catalog-visibility.ts — and then, in a fifth
 * copy on the staff auction detail view, silently omitted `sold_offline`
 * (see auction-detail-view.tsx's `isSold` for the bug that caused). One
 * definition now, shared by all of them, so it cannot drift a sixth time.
 */
export function isSoldOutcome(outcome: string | null): boolean {
  return outcome === 'sold' || outcome === 'sold_offline';
}
