export interface BuyNowErrorLike {
  code?: string;
  message?: string;
}

export type BuyNowErrorClassification =
  /** Missing profile fields — the panel attaches a CTA to /settings/profile,
   *  same as placeBid's identical sentinel, so it can't be a plain string. */
  { kind: 'profile_incomplete' } | { kind: 'message'; text: string };

/**
 * Maps a `buyNow` callable failure (functions/src/auctions/buyNow.ts) to
 * buyer-facing Spanish.
 *
 * Matches on `code` first, not `message`: the callable's HttpsError messages
 * are already human Spanish for every failed-precondition branch (unlike
 * placeBid's, which this codebase matches by message substring), but the
 * *code* is what's stable across those branches and across the auth/registry
 * failures (unauthenticated, not-found, invalid-argument) that surface only
 * generic English text. Two cases are still matched by message instead —
 * magic strings, not codes, by the same convention placeBid's error handling
 * already uses: `profile_incomplete`, and the expectedPrice mismatch (which
 * otherwise shares its code with every other failed-precondition branch).
 *
 * The one scenario this task is built around — two buyers racing for the
 * same buy-now unit — always lands here as `failed-precondition` (bidCount
 * went from 0 to 1 under the loser's feet), so it must never show the raw
 * code to the loser.
 */
export function classifyBuyNowError({
  code = '',
  message = '',
}: BuyNowErrorLike): BuyNowErrorClassification {
  if (message.includes('profile_incomplete')) {
    return { kind: 'profile_incomplete' };
  }
  if (code.includes('resource-exhausted')) {
    return { kind: 'message', text: 'Demasiados intentos. Probá de nuevo en un minuto.' };
  }
  // The price-changed-underneath-you case (buyNow.ts's expectedPrice check)
  // shares its code with every other failed-precondition branch below
  // (already sold, ended, has bids, no buyNowPrice) — code alone can't tell
  // them apart, so this one is matched by message substring first, same
  // convention as profile_incomplete above. It must never fall through to
  // the generic "ya no disponible" text: that would tell a buyer the unit is
  // gone when the real story is "the price moved, look again."
  if (code.includes('failed-precondition') && message.includes('precio de Compra ya cambió')) {
    return {
      kind: 'message',
      text: 'El precio de Compra ya cambió. Revisá el precio actualizado antes de confirmar.',
    };
  }
  if (code.includes('failed-precondition')) {
    return {
      kind: 'message',
      text: 'Esta unidad ya no está disponible para compra directa.',
    };
  }
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return { kind: 'message', text: 'No tenés permiso para realizar esta compra.' };
  }
  // Blocking 4: not-found is NOT proof the auction was deleted. It's reachable
  // two ways: (1) genuinely — deleteAuction.ts isn't transactional and CAN
  // delete a live, zero-bid auction (exactly the state Compra ya requires) at
  // the same instant a buyer's buyNow call is in flight; (2) transiently — a
  // concurrent buyNow's transaction retry can observe a false not-found under
  // heavy contention (root-caused during the task-11 fix wave; see its
  // report) even though the document was never deleted. Telling the buyer
  // "ya no existe" is actively wrong in case (2), and unhelpful in both:
  // there is nothing to "look at again" the way the price-changed or
  // already-sold messages offer. A neutral retry prompt is honest either way.
  if (code.includes('not-found')) {
    return {
      kind: 'message',
      text: 'No pudimos confirmar tu compra en este momento. Actualizá la página e intentá de nuevo.',
    };
  }
  return { kind: 'message', text: 'No se pudo completar la compra.' };
}
