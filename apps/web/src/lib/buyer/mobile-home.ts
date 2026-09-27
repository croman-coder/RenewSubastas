/**
 * Cuentas del Inicio del comprador (spec 2026-09-27 §5.2 y §6).
 *
 * Los tipos son estructurales a propósito: calzan con BuyerStats
 * (load-buyer-stats.ts) sin importarlo, porque ese módulo es server-only y
 * este lo usan la tarjeta del cliente y los tests.
 */
export interface HomeWinningItem {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  currentBid: number;
  endsAtMs: number;
}

export interface HomeClosingItem {
  id: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  currentBid: number;
  startingPrice: number;
  endsAtMs: number;
}

export interface HomeStats {
  myWinning: HomeWinningItem[];
  closingSoon: HomeClosingItem[];
  /** Subastas en las que el comprador pujó alguna vez. */
  myBidAuctionIds: string[];
}

export interface NextClosingItem {
  auctionId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  /** Lo que se muestra: la puja actual, o el precio inicial si no hay pujas. */
  amountUsd: number;
  hasBids: boolean;
  endsAtMs: number;
  /** Si el comprador ya pujó ahí: "Te superaron" en vez de "Todavía no pujaste". */
  iBid: boolean;
}

export interface NextClosing {
  kind: 'winning' | 'closing';
  item: NextClosingItem;
}

const DAY_MS = 86_400_000;

/**
 * "La próxima que cierra": primero la subasta que vas ganando con cierre más
 * cercano —es la que más te importa perder—; si no vas ganando ninguna, la
 * próxima de las que cierran pronto. Se descartan las que ya cerraron por
 * reloj aunque el documento todavía diga "live" (el tick corre cada minuto).
 */
export function pickNextClosing(stats: HomeStats, nowMs: number): NextClosing | null {
  const winning = stats.myWinning
    .filter((w) => w.endsAtMs > nowMs)
    .sort((a, b) => a.endsAtMs - b.endsAtMs)[0];
  if (winning) {
    return {
      kind: 'winning',
      item: {
        auctionId: winning.auctionId,
        make: winning.make,
        model: winning.model,
        year: winning.year,
        thumbnailUrl: winning.thumbnailUrl,
        amountUsd: winning.currentBid,
        hasBids: true,
        endsAtMs: winning.endsAtMs,
        iBid: true,
      },
    };
  }
  const next = stats.closingSoon
    .filter((c) => c.endsAtMs > nowMs)
    .sort((a, b) => a.endsAtMs - b.endsAtMs)[0];
  if (!next) return null;
  return {
    kind: 'closing',
    item: {
      auctionId: next.id,
      make: next.make,
      model: next.model,
      year: next.year,
      thumbnailUrl: next.thumbnailUrl,
      amountUsd: next.currentBid > 0 ? next.currentBid : next.startingPrice,
      hasBids: next.currentBid > 0,
      endsAtMs: next.endsAtMs,
      iBid: stats.myBidAuctionIds.includes(next.id),
    },
  };
}

/**
 * Barra de progreso de la tarjeta: cuánto pasó de las últimas 24 h antes del
 * cierre. Ventana fija de 24 h porque es la de "Cierran pronto": con más
 * tiempo la barra queda vacía, y llena al cerrar.
 */
export function closeProgress(endsAtMs: number, nowMs: number): number {
  const p = 1 - (endsAtMs - nowMs) / DAY_MS;
  return Math.min(1, Math.max(0, p));
}

/**
 * "Si ganás todo" y "Seña a pagar": suma de lo que vas ganando y la seña con
 * el porcentaje real de app_config/global.payment (fracción: 0.1 = 10 %).
 * La seña se redondea al dólar porque es una cifra orientativa; el monto
 * exacto lo calcula el servidor al adjudicar (close-auction.ts).
 */
export function commitment(
  myWinning: ReadonlyArray<{ currentBid: number }>,
  depositPercent: number,
): { totalUsd: number; depositUsd: number; count: number } {
  const totalUsd = myWinning.reduce((acc, w) => acc + w.currentBid, 0);
  return { totalUsd, depositUsd: Math.round(totalUsd * depositPercent), count: myWinning.length };
}
