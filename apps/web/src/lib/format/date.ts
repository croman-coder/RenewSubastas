/**
 * Date formatting helpers that always render in Paraguay's timezone
 * (`America/Asuncion`, UTC-3 year-round since 2024 — no DST).
 *
 * Why this exists: server components render in UTC by default (Cloud
 * Functions / Netlify functions), so `new Date().toLocaleDateString()`
 * shows the wrong day during local evening hours (after 21:00 local =
 * past midnight UTC). Pinning the timezone fixes admin/staff/buyer
 * dashboards that display "today's" date.
 */

const PY_TIMEZONE = 'America/Asuncion';

/**
 * Long human date: "miércoles, 7 de mayo".
 *
 * Used as an eyebrow on dashboard hero headers.
 */
export function formatLongDatePy(locale: string, date: Date = new Date()): string {
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: PY_TIMEZONE,
  });
}

/**
 * Short numeric date: "07/05/2026". For tables and timestamps.
 */
export function formatShortDatePy(locale: string, date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: PY_TIMEZONE,
  });
}

/**
 * Time only: "21:07". Used in audit log and notification timestamps.
 */
export function formatTimePy(locale: string, date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PY_TIMEZONE,
  });
}
