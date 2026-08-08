/**
 * Client-side UX guard only, for the staff edit form: blocks the obvious
 * case — a Compra Ya price typed at or below a reserve that's also present
 * in the form — before the round trip to `updateAuction`.
 *
 * Deliberately NOT a re-implementation of the server's floor rule. That rule
 * (functions/src/auctions/updateAuction.ts) compares against the EFFECTIVE
 * reserve after the whole edit lands — falling back to startingPrice when no
 * reserve survives it — and owns two distinct Spanish messages for the two
 * cases. Duplicating that branching here would drift the moment the server
 * rule changes, and the brief this implements is explicit: block the obvious
 * case, let the server's own message surface for the rest. So when
 * `reserveInput` is blank (no reserve in the form to compare against) this
 * always returns false and a too-low buyNowPrice is caught server-side
 * instead, via its "...mayor al precio inicial." message.
 */
export function isBuyNowBelowReserve(buyNowInput: string, reserveInput: string): boolean {
  if (buyNowInput.trim() === '' || reserveInput.trim() === '') return false;
  return Number(buyNowInput) <= Number(reserveInput);
}
