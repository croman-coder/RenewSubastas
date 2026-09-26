import { isSoldOutcome } from './sold-outcome';
import { isVisibleInCatalog } from '@/lib/buyer/catalog-visibility';

/**
 * Qué muestra la página pública de una subasta, y si los motores de búsqueda
 * pueden indexarla (spec 2026-09-26 §6, "según el resultado", elegido por Croman).
 * Función pura, así cada fila de esa tabla es un test.
 */
export type FinishedResult = 'sold' | 'unsold' | 'cancelled' | 'pending';

export type PublicAuctionState =
  | { kind: 'scheduled'; indexable: true }
  | { kind: 'live'; indexable: true }
  | { kind: 'sold-visible'; indexable: false }
  | { kind: 'redirect'; toAuctionId: string; indexable: false }
  | { kind: 'finished'; result: FinishedResult; indexable: false };

interface StateInput {
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  outcome: string | null;
  endsAtMs: number;
}

/**
 * Solo las subastas no vendidas o canceladas necesitan saber de una más reciente.
 */
export function needsRelistLookup(a: StateInput): boolean {
  if (a.status === 'cancelled') return true;
  return a.status === 'ended' && !isSoldOutcome(a.outcome);
}

export function publicAuctionState(
  a: StateInput,
  relistedId: string | null,
  nowMs: number,
): PublicAuctionState {
  if (a.status === 'scheduled') return { kind: 'scheduled', indexable: true };
  if (a.status === 'live') {
    // El tick que cierra subastas corre cada minuto aproximadamente: pasada la hora de cierre
    // pero aún en estado `live` significa que el resultado no se conoce todavía.
    return a.endsAtMs > nowMs
      ? { kind: 'live', indexable: true }
      : { kind: 'finished', result: 'pending', indexable: false };
  }
  if (a.status === 'ended' && isSoldOutcome(a.outcome)) {
    return isVisibleInCatalog(a, nowMs)
      ? { kind: 'sold-visible', indexable: false }
      : { kind: 'finished', result: 'sold', indexable: false };
  }
  if (relistedId) return { kind: 'redirect', toAuctionId: relistedId, indexable: false };
  return {
    kind: 'finished',
    result: a.status === 'cancelled' ? 'cancelled' : 'unsold',
    indexable: false,
  };
}
