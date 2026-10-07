/**
 * Un teléfono es "usable" si tiene al menos 8 dígitos y, cuando empieza con el
 * código de Paraguay (595), exactamente 12 (595 + 9). Misma regla que
 * `phoneDigits` en apps/web/src/lib/admin/contact-links.ts; se repite acá
 * porque las functions no pueden importar de apps/web.
 *
 * Se exige para pujar y comprar (placeBid, buyNow): si el comprador gana, el
 * equipo tiene que poder llamarlo o escribirle por WhatsApp. Un "+59598112"
 * (número cortado) no sirve para eso aunque tenga 8 dígitos. El resto de los
 * países conserva el mínimo de 8: no hay forma barata de validar cada plan de
 * numeración.
 */
export const MIN_PHONE_DIGITS = 8;
const PY_PREFIX = '595';
const PY_TOTAL_DIGITS = 12;

export function hasUsablePhone(phone: unknown): boolean {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return false;
  if (digits.startsWith(PY_PREFIX)) return digits.length === PY_TOTAL_DIGITS;
  return true;
}
