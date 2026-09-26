/**
 * Formato único de montos y cantidades para toda la app, al estilo de
 * Paraguay: punto para miles, coma para decimales.
 *
 *   formatUsd(9000)       → "USD 9.000"
 *   formatUsd(29000.5)    → "USD 29.000,50"
 *   formatAmount(15000)   → "15.000"        (para cuando "USD" va aparte)
 *   formatNumber(1234)    → "1.234"         (cantidades: km, visitas, pujas)
 *
 * Por qué no `toLocaleString('es-PY')`: hasta el 2026-09-26 cada pantalla
 * formateaba a su manera y el mismo catálogo mostraba "USD 9000" al lado de
 * "USD 15.000" (CLDR no agrupa en español los números de cuatro cifras),
 * "USD 29.000,00" en la ficha y "USD 29.000" en la tarjeta. Y las llamadas sin
 * idioma daban "29,000" en el servidor (Netlify corre en inglés) y "29.000" en
 * el navegador: el mismo texto distinto en cada lado, que React reporta como
 * error de hidratación. Esto no depende de Intl ni del idioma del sistema, así
 * que sale igual en todos lados.
 *
 * Los centavos aparecen solo cuando existen: los precios son casi siempre
 * redondos, y un ",00" en cada número es ruido.
 */

const EMPTY = '—';

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return EMPTY;
  const cents = Math.round(amount * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = group(String(Math.floor(abs / 100)));
  const fraction = abs % 100;
  return fraction === 0
    ? `${sign}${whole}`
    : `${sign}${whole},${String(fraction).padStart(2, '0')}`;
}

export function formatUsd(amount: number): string {
  const formatted = formatAmount(amount);
  return formatted === EMPTY ? EMPTY : `USD ${formatted}`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return EMPTY;
  const rounded = Math.round(n);
  return `${rounded < 0 ? '-' : ''}${group(String(Math.abs(rounded)))}`;
}
