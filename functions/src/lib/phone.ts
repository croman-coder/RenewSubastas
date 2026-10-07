/**
 * Un teléfono es "usable" si tiene al menos 8 dígitos. Mismo umbral que
 * `phoneDigits` en apps/web/src/lib/admin/contact-links.ts; se repite acá
 * porque las functions no pueden importar de apps/web.
 *
 * Se exige para pujar y comprar (placeBid, buyNow): si el comprador gana, el
 * equipo tiene que poder llamarlo o escribirle por WhatsApp. No se valida el
 * formato más allá de eso: el formulario del perfil ya arma el número con el
 * prefijo del país y acá solo importa que haya un número al que llegar.
 */
export const MIN_PHONE_DIGITS = 8;

export function hasUsablePhone(phone: unknown): boolean {
  if (typeof phone !== 'string') return false;
  return phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;
}
