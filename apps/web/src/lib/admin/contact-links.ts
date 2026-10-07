/**
 * Enlaces de contacto (WhatsApp / llamada) a partir del teléfono guardado en
 * `profile.phone`.
 *
 * El campo no tiene un formato único: el formulario nuevo guarda E.164
 * ("+595981123456"), pero hay cuentas cargadas a mano o viejas con "0981 123
 * 456" o "(021) 123-456". `wa.me` y `tel:` necesitan dígitos con código de
 * país, así que acá se normaliza una sola vez en lugar de repetir la regla en
 * cada pantalla.
 *
 * Misma regla que `functions/src/lib/phone.ts` (las functions no pueden
 * importar de apps/web): mínimo 8 dígitos para considerar el teléfono usable.
 */

const MIN_DIGITS = 8;
const PY_COUNTRY_CODE = '595';

export function phoneDigits(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < MIN_DIGITS) return null;
  // Con "+" el usuario ya dio el código de país: no se toca.
  if (trimmed.startsWith('+')) return digits;
  // Número local de Paraguay: el 0 inicial es el prefijo troncal ("0981...",
  // "021..."), que no existe en formato internacional.
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    return `${PY_COUNTRY_CODE}${digits.slice(1)}`;
  }
  return digits;
}

export function whatsappUrl(digits: string): string {
  return `https://wa.me/${digits}`;
}

export function telUrl(digits: string): string {
  return `tel:+${digits}`;
}

/**
 * Teléfono para leer en pantalla. Los móviles de Paraguay (12 dígitos con el
 * 595) se agrupan "+595 981 123 456"; cualquier otro formato se muestra como
 * se guardó, porque adivinar la agrupación de otro país sería inventar datos.
 * Devuelve null cuando no hay un teléfono usable.
 */
export function formatPhoneForReading(raw: string | undefined): string | null {
  const digits = phoneDigits(raw);
  if (!digits) return null;
  if (digits.startsWith(PY_COUNTRY_CODE) && digits.length === 12) {
    const n = digits.slice(3);
    return `+${PY_COUNTRY_CODE} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return (raw ?? '').trim();
}

/**
 * "CI 1234567" / "RUC 80012345-6" / "Pasaporte AB1234567". Null sin número:
 * el tipo solo no identifica a nadie (el formulario lo deja en CI por defecto).
 */
export function formatDocument(
  type: string | undefined,
  number: string | undefined,
): string | null {
  const n = number?.trim();
  if (!n) return null;
  const label = type === 'PASSPORT' ? 'Pasaporte' : type;
  return label ? `${label} ${n}` : n;
}

/**
 * Cómo se dio de alta la cuenta, a partir del `provider` que escriben
 * registerGoogleBuyer ('google') y registerPasswordBuyer ('password'). Las
 * cuentas que crea el equipo desde el admin no llevan el campo.
 */
export function registrationLabel(provider: string | undefined): string {
  if (provider === 'google') return 'Google';
  if (provider === 'password') return 'Correo y contraseña';
  return 'Creado por el equipo';
}
