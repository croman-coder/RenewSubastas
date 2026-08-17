/**
 * Monto mínimo que el servidor va a aceptar como próxima puja.
 *
 * El precio base cuenta como una oferta ya puesta: para participar hay que
 * superarla, no igualarla. Antes la primera puja podía ser exactamente el
 * precio inicial, así que una subasta quedaba "con puja" sin que nadie
 * hubiera ofrecido un guaraní por encima de lo pedido.
 *
 * Y la primera puja tiene además un piso propio: USD 500 sobre el precio
 * base, o el incremento de la subasta si es mayor. Es una regla comercial
 * —que una unidad no se adjudique pegada al precio publicado—, no técnica.
 * De la segunda puja en adelante manda el incremento sobre la vigente: el
 * piso ya lo garantizó la primera y todas las siguientes son mayores.
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
export const MIN_FIRST_BID_OVER_BASE_USD = 500;

export function minimumBid({
  currentBid,
  startingPrice,
  bidIncrement,
}: {
  currentBid: number;
  startingPrice: number;
  bidIncrement: number;
}): number {
  // Sin pujas: la primera oferta se despega del precio base por USD 500 —
  // pedido de comercial— o por el incremento, lo que sea mayor. Con pujas:
  // manda el incremento sobre la vigente, y el piso de 500 ya quedó
  // garantizado por la primera.
  const min =
    currentBid > 0
      ? currentBid + bidIncrement
      : startingPrice + Math.max(bidIncrement, MIN_FIRST_BID_OVER_BASE_USD);
  return Math.round(min * 100) / 100;
}
