/**
 * Ruta de vuelta a la subasta desde el formulario de perfil.
 *
 * El aviso "completá tu perfil para pujar" enlaza a
 * `/settings/profile?completar=1&from=/es/auctions/<id>`. `from` llega de la
 * URL, o sea de cualquiera: solo se acepta la ruta exacta de una subasta del
 * mismo idioma (sin esquema, host, query, fragmento ni subrutas), para que
 * nadie arme un enlace que, tras guardar el perfil, mande a otro sitio.
 */
export function safeAuctionReturnPath(
  from: string | string[] | undefined,
  locale: string,
): string | null {
  // Un `from` repetido en la URL llega como arreglo: se descarta en vez de
  // romper la página de perfil con un `startsWith` sobre un arreglo.
  if (typeof from !== 'string' || !from) return null;
  const prefix = `/${locale}/auctions/`;
  if (!from.startsWith(prefix)) return null;
  return /^[A-Za-z0-9_-]+$/.test(from.slice(prefix.length)) ? from : null;
}
