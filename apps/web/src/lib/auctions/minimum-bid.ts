/**
 * Monto mínimo que el servidor va a aceptar como próxima puja.
 *
 * El precio base cuenta como una oferta ya puesta: para participar hay que
 * superarla, no igualarla. Antes la primera puja podía ser exactamente el
 * precio inicial y recién desde la segunda regía el incremento, así que una
 * subasta podía quedar "con puja" sin que nadie hubiera ofrecido un guaraní
 * por encima de lo pedido. Ahora es una sola regla en los dos casos: un
 * incremento arriba de lo que haya, sea el precio base o la puja vigente.
 *
 * Espejo de functions/src/auctions/placeBid.ts. Allá se rechaza —esa es la
 * autoridad—; acá se calcula para que los botones de puja rápida y el mínimo
 * del campo manual ofrezcan montos que el servidor no vaya a devolver.
 *
 * Redondea a centavos por la misma razón que el resto del panel: datos viejos
 * con un `currentBid` como 16002.55555555 arrastrarían esa basura al próximo
 * mínimo y el validador de dos decimales del servidor rechazaría una puja
 * perfectamente intencionada.
 */
export function minimumBid({
  currentBid,
  startingPrice,
  bidIncrement,
}: {
  currentBid: number;
  startingPrice: number;
  bidIncrement: number;
}): number {
  const floor = currentBid > 0 ? currentBid : startingPrice;
  return Math.round((floor + bidIncrement) * 100) / 100;
}
