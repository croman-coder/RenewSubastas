/**
 * Qué muestra la barra fija de puja de la ficha en el celular (spec
 * 2026-09-27 §5.4).
 *
 * - bid: en vivo y no vas ganando → "Tu próxima puja USD X" + Pujar, con X =
 *   el mínimo que el servidor va a aceptar (minimumBid).
 * - winning: en vivo y vas ganando → "Vas ganando USD X" con X = la puja
 *   actual y SIN botón. La spec pedía "Subir puja", pero placeBid rechaza que
 *   el mejor postor vuelva a pujar (functions/src/auctions/placeBid.ts), así
 *   que ese botón solo llevaría a un error.
 * - scheduled: "Abre en HH:MM:SS", sin botón.
 * - hidden: terminada o cancelada; el resultado ya está en la página.
 *
 * El reloj manda sobre el estado guardado, igual que en BidPanel: el tick que
 * pasa la subasta a 'ended' corre cada minuto.
 */
export interface DockInput {
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAtMs: number;
  endsAtMs: number;
  currentBid: number;
  currentBidderUid: string | null;
}

export type DockState =
  | { kind: 'bid'; amountUsd: number }
  | { kind: 'winning'; amountUsd: number }
  | { kind: 'scheduled'; opensInMs: number }
  | { kind: 'hidden' };

export function dockState(
  live: DockInput,
  myUid: string,
  nowMs: number,
  minBid: number,
): DockState {
  if (live.status === 'scheduled') {
    return { kind: 'scheduled', opensInMs: Math.max(0, live.startsAtMs - nowMs) };
  }
  if (live.status !== 'live' || nowMs >= live.endsAtMs) return { kind: 'hidden' };
  if (live.currentBidderUid === myUid && live.currentBid > 0) {
    return { kind: 'winning', amountUsd: live.currentBid };
  }
  return { kind: 'bid', amountUsd: minBid };
}
