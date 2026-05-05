/**
 * Paraguay RUC check digit using mod 11.
 * Weights cycle 2..7 right-to-left over base digits.
 * sum mod 11; check = 11 - remainder; if >= 10, check = 0.
 */
export function computeRucCheckDigit(base: string): number {
  if (!/^\d+$/.test(base)) {
    throw new Error('RUC base must be numeric');
  }
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check >= 10) return 0;
  return check;
}

export function isValidRucPy(value: string): boolean {
  const match = /^(\d{6,10})-(\d)$/.exec(value);
  if (!match) return false;
  const base = match[1]!;
  const check = Number(match[2]);
  return computeRucCheckDigit(base) === check;
}

export function isValidCiPy(value: string): boolean {
  return /^\d{5,10}$/.test(value);
}
