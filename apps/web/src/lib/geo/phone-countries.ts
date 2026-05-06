/**
 * Country list for the phone-number country picker.
 *
 * Each entry carries:
 *   - iso2: ISO-3166 alpha-2 code (used as the stable form value).
 *   - name: display name in Spanish.
 *   - dial: international dial prefix (digits only, no '+').
 *   - flag: emoji flag for the option label.
 *   - max: max digits the buyer types AFTER the prefix. Conservative
 *          per-country values; lets the form reject obvious typos without
 *          implementing full E.164 parsing.
 *
 * Curated list focused on Paraguay + neighbours + countries CARBID buyers
 * are realistically going to come from. Paraguay is hard-pinned at the top.
 */
export interface PhoneCountry {
  iso2: string;
  name: string;
  dial: string;
  flag: string;
  /** Max number of digits the user types (after the prefix). */
  max: number;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso2: 'PY', name: 'Paraguay', dial: '595', flag: '🇵🇾', max: 9 },
  { iso2: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷', max: 11 },
  { iso2: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷', max: 11 },
  { iso2: 'BO', name: 'Bolivia', dial: '591', flag: '🇧🇴', max: 8 },
  { iso2: 'UY', name: 'Uruguay', dial: '598', flag: '🇺🇾', max: 9 },
  { iso2: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱', max: 9 },
  { iso2: 'PE', name: 'Perú', dial: '51', flag: '🇵🇪', max: 9 },
  { iso2: 'CO', name: 'Colombia', dial: '57', flag: '🇨🇴', max: 10 },
  { iso2: 'EC', name: 'Ecuador', dial: '593', flag: '🇪🇨', max: 9 },
  { iso2: 'VE', name: 'Venezuela', dial: '58', flag: '🇻🇪', max: 10 },
  { iso2: 'MX', name: 'México', dial: '52', flag: '🇲🇽', max: 10 },
  { iso2: 'US', name: 'Estados Unidos', dial: '1', flag: '🇺🇸', max: 10 },
  { iso2: 'ES', name: 'España', dial: '34', flag: '🇪🇸', max: 9 },
];

export const DEFAULT_PHONE_COUNTRY: PhoneCountry = PHONE_COUNTRIES[0]!;

export function findCountryByIso2(iso2: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.iso2 === iso2);
}

export function findCountryByDial(dial: string): PhoneCountry | undefined {
  // Longest prefix match handles cases like 595 vs 5.
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  return sorted.find((c) => dial.startsWith(c.dial));
}

/**
 * Splits a stored phone string (e.g. "+595981123456" or "+1 415 555 1234")
 * into a country prefix and the local digits typed by the user.
 *
 * Returns null when the input doesn't carry a known prefix — caller can
 * fall back to the default country.
 */
export function splitStoredPhone(value: string | undefined | null): {
  country: PhoneCountry;
  national: string;
} {
  if (!value) {
    return { country: DEFAULT_PHONE_COUNTRY, national: '' };
  }
  const digits = value.replace(/\D/g, '');
  const found = findCountryByDial(digits);
  if (!found) {
    return { country: DEFAULT_PHONE_COUNTRY, national: digits };
  }
  return { country: found, national: digits.slice(found.dial.length) };
}
