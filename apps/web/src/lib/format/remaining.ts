/**
 * Tiempo restante en texto para el celular del comprador (spec 2026-09-27).
 *
 * Tres formas porque cada lugar pide una distinta: el reloj grande de "La
 * próxima que cierra" (HH:MM:SS aunque pase de 24 h, porque es una sola
 * subasta y los días en ese reloj confunden), la fila del catálogo (igual que
 * la tarjeta: días cuando hay días) y los textos cortos ("quedan 3 h 20 min").
 * Sin Intl a propósito, como money.ts: sale igual en el servidor y en el
 * navegador, y no rompe la hidratación.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function remainingLabel(ms: number): string {
  if (ms <= 0) return '0 min';
  if (ms < 60_000) return 'menos de 1 min';
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (days > 0) return h > 0 ? `${days} d ${h} h` : `${days} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}
