// Detecta pujas que probablemente tienen un cero de más. Nace del 10/11/2026:
// en el KIA Sportage 2018 un comprador pujó USD 110.000 con la mínima en 14.000
// y hubo que anular la puja a mano. No bloquea (puede ser intencional): la
// segunda confirmación del panel lo avisa en rojo.

/** Desde cuántas veces la puja mínima se considera inusual. */
export const UNUSUAL_BID_MULTIPLE = 2;

export function isUnusuallyHighBid(amount: number, minimumBid: number): boolean {
  if (!Number.isFinite(minimumBid) || minimumBid <= 0) return false;
  return amount >= minimumBid * UNUSUAL_BID_MULTIPLE;
}
