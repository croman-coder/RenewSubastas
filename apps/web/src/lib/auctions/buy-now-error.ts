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
 * generic English text. `profile_incomplete` is the one case still matched
 * by message: it's a magic string, not a code, by the same convention
 * placeBid's error handling already uses.
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
  if (code.includes('failed-precondition')) {
    return {
      kind: 'message',
      text: 'Esta unidad ya no está disponible para compra directa.',
    };
  }
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return { kind: 'message', text: 'No tenés permiso para realizar esta compra.' };
  }
  if (code.includes('not-found')) {
    return { kind: 'message', text: 'Esta subasta ya no existe.' };
  }
  return { kind: 'message', text: 'No se pudo completar la compra.' };
}
