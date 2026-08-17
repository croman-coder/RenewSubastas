/**
 * Precio con el que se cerró una subasta adjudicada.
 *
 * Los tres caminos de cierre —el scheduler, Compra ya y el cierre manual—
 * escriben `finalPrice`. Pero hay documentos anteriores a que ese campo
 * existiera, y ahí `finalPrice` simplemente no está. La lectura hacía
 * `?? 0`, así que a la persona que había ganado el remate la pantalla de pago
 * le decía **USD 0**: no es un dato faltante que se disimula, es un precio
 * equivocado en la única pantalla donde se le pide plata.
 *
 * `currentBid` es la puja con la que la subasta cerró y es de donde
 * `finalPrice` se copia en los tres caminos, así que en un documento viejo
 * tiene el valor correcto. Se usa como respaldo antes de rendirse.
 *
 * El 0 se sigue devolviendo si de verdad no hay nada, pero en ese caso no
 * queda ningún número plausible que mostrar y el llamador tiene que decidir
 * si oculta el importe en lugar de afirmar un precio inventado.
 */
export function resolveFinalPrice(auction: { finalPrice?: unknown; currentBid?: unknown }): number {
  const final = auction.finalPrice;
  if (typeof final === 'number' && Number.isFinite(final) && final > 0) return final;
  const current = auction.currentBid;
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) return current;
  return 0;
}
