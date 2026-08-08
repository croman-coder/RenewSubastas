interface CatalogItem {
  status: string;
  outcome: string | null;
  endsAtMs: number;
}

/**
 * Whether an auction belongs in the `tab: 'all'` public catalog.
 *
 * The rule this protects: anything still open is always shown; anything
 * `ended` is shown ONLY while it's a genuine sale (`sold` or `sold_offline`)
 * AND its lote hasn't closed yet (`endsAtMs > nowMs`) — a sold unit is social
 * proof, an unsold one (`reserve_not_met`, `no_bids`) is not.
 *
 * Pulled out of `listPublicAuctions` as a pure function — that loader is
 * `server-only` (Firestore Admin SDK), so a plain `import` from a vitest test
 * throws immediately (confirmed: `server-only`'s package.json has no
 * `react-server` export condition wired into this project's vitest config,
 * so it always resolves to the throwing build, not the no-op one). Living
 * here, next to `batch.ts`'s identical reasoning for the same constraint,
 * means the exact function the loader calls is the one under test, instead
 * of a hand-copied duplicate that could drift from the real query.
 *
 * `endsAtMs` is checked here even though the caller's Firestore query for the
 * `ended` set already constrains `endsAt > now` — on purpose. The rule has
 * two independent parts (which outcomes count, and how long they stay
 * visible); if only the query enforced the timing half, a future change to
 * that query could silently drop it without this function's own tests
 * noticing anything wrong.
 */
export function isVisibleInCatalog(item: CatalogItem, nowMs: number): boolean {
  if (item.status !== 'ended') return true;
  return (item.outcome === 'sold' || item.outcome === 'sold_offline') && item.endsAtMs > nowMs;
}
