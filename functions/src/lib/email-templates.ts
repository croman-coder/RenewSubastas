// Shared HTML email building blocks for Renew Subastas transactional
// mail. Table-based, inline-styled, dark-header / light-body — the
// patterns email clients (Gmail, Outlook, Apple Mail) actually render.
// Monochrome brand: ink header with the white wordmark, white content
// card, ink CTA. Accent colour only for semantic status badges.

const LOGO_WHITE = 'https://renewsubastas.com.py/brand/renew-wordmark-white.png';
const SITE = 'https://renewsubastas.com.py';

/**
 * Escapes a plain-text value for safe interpolation into an HTML email.
 * None of the builders below escape their own inputs — several (`callout`,
 * `heading`'s `sub`, the bank-instructions paragraph in sendAuctionWon)
 * intentionally receive pre-built HTML mixed with trusted static markup, so
 * escaping inside the builder would double-escape that markup. Every
 * caller MUST wrap a value that ultimately traces back to buyer input
 * (profile firstName/lastName — settable via Google sign-in with an
 * arbitrary display name —, email, phone, address, documentNumber) with
 * this before interpolating it, so a crafted name like
 * `<a href="evil">click</a>` can't render as a live link inside an
 * internal staff/admin operational email.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

const BADGE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: '#27272a', fg: '#fafafa' },
  success: { bg: '#dcfce7', fg: '#166534' },
  danger: { bg: '#fee2e2', fg: '#991b1b' },
  warning: { bg: '#fef3c7', fg: '#92400e' },
  info: { bg: '#dbeafe', fg: '#1e40af' },
};

/**
 * Full email shell. Dark ink header band with the white wordmark, a
 * white rounded content card, and a quiet footer. `inner` is the HTML
 * that lives inside the content card (already padded).
 */
export function emailShell(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#e9e9eb;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e9eb;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <!-- Header band -->
          <tr><td style="background:#0a0a0a;border-radius:18px 18px 0 0;padding:26px 32px;">
            <img src="${LOGO_WHITE}" alt="Renew Subastas" height="26" style="display:block;height:26px;width:auto;border:0;" />
          </td></tr>

          <!-- Content card -->
          <tr><td style="background:#ffffff;padding:0;">
            ${inner}
          </td></tr>

          <!-- Footer -->
          <tr><td style="background:#fafafa;border-radius:0 0 18px 18px;padding:22px 32px;border-top:1px solid #f0f0f0;">
            <p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:#a1a1aa;">
              Renew Subastas · Santa Rosa Paraguay SA · Paraguay
            </p>
            <p style="margin:0;font-size:11px;line-height:1.5;color:#c4c4c8;">
              Este es un correo automático. Por dudas, respondé a este mensaje.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body></html>`;
}

/** Eyebrow badge (status pill) above the headline. */
export function badge(text: string, tone: BadgeTone = 'neutral'): string {
  const c = BADGE[tone];
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;padding:5px 11px;border-radius:999px;">${text}</span>`;
}

/** Big headline + supporting paragraph. */
export function heading(title: string, sub?: string): string {
  return `
    <h1 style="margin:14px 0 ${sub ? '6px' : '0'};font-size:27px;line-height:1.2;color:#0a0a0a;font-weight:800;letter-spacing:-0.4px;">${title}</h1>
    ${sub ? `<p style="margin:0;font-size:15px;line-height:1.55;color:#52525b;">${sub}</p>` : ''}`;
}

/** Two side-by-side stat tiles (e.g. precio final + seña). `strong` ink-fills a tile. */
export function statPair(
  a: { label: string; value: string; strong?: boolean },
  b: { label: string; value: string; strong?: boolean },
): string {
  const tile = (t: { label: string; value: string; strong?: boolean }) => `
    <td width="50%" style="padding:0 5px;">
      <div style="background:${t.strong ? '#0a0a0a' : '#f5f5f5'};border-radius:12px;padding:15px 16px;">
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${t.strong ? '#a1a1aa' : '#71717a'};font-weight:700;">${t.label}</div>
        <div style="font-size:23px;font-weight:800;color:${t.strong ? '#ffffff' : '#0a0a0a'};margin-top:5px;letter-spacing:-0.3px;">${t.value}</div>
      </div>
    </td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:separate;"><tr>${tile(a)}${tile(b)}</tr></table>`;
}

/** Section label (small uppercase) above a data block. */
export function sectionLabel(text: string): string {
  return `<h2 style="margin:20px 0 6px;font-size:12px;color:#0a0a0a;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">${text}</h2>`;
}

/** Key/value rows table. Pass [label, value] pairs; empty values render as "—". */
export function dataRows(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#71717a;width:150px;font-size:13px;vertical-align:top;">${k}</td><td style="padding:6px 0;font-weight:600;font-size:13px;color:#0a0a0a;">${v || '—'}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>`;
}

/** Full-width primary CTA button. */
export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px;"><tr><td style="background:#0a0a0a;border-radius:11px;">
    <a href="${href}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;letter-spacing:0.2px;">${label}</a>
  </td></tr></table>`;
}

/** Tinted callout box (e.g. deadline warning). */
export function callout(html: string, tone: BadgeTone = 'warning'): string {
  const c = BADGE[tone];
  return `<div style="background:${c.bg};border-radius:12px;padding:14px 16px;margin:16px 0;">
    <p style="margin:0;font-size:13px;line-height:1.5;color:${c.fg};">${html}</p>
  </div>`;
}

/** Padded content wrapper for the card body. */
export function body(inner: string): string {
  return `<div style="padding:26px 32px 28px;">${inner}</div>`;
}

export const SITE_URL = SITE;
