import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Renew Subastas — subastas de vehículos usados certificados';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social preview card.
 *
 * The landing shipped Open Graph tags but no image, so every share — the
 * WhatsApp forward that surfaced this, Google's result card, any chat
 * unfurl — rendered as a bare text link. Generated rather than a checked-in
 * PNG so the copy stays in sync with the page and there's no binary to
 * re-export whenever the wording changes.
 *
 * Deliberately type-only: Satori would need a font file shipped and loaded
 * for anything fancier, and a plain high-contrast card reads better at
 * thumbnail size than a photo with text over it.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0a0a0a',
        padding: '72px 80px',
      }}
    >
      {/* Accent bar — the copper the product uses for emphasis. */}
      <div style={{ display: 'flex', width: 120, height: 8, background: '#b87333' }} />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: 26,
            letterSpacing: 6,
            color: '#a1a1aa',
            textTransform: 'uppercase',
          }}
        >
          Renew · Santa Rosa
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 76,
            lineHeight: 1.05,
            fontWeight: 700,
            color: '#fafafa',
            maxWidth: 900,
          }}
        >
          Subastas de vehículos usados certificados
        </div>
        <div style={{ marginTop: 24, fontSize: 32, color: '#a1a1aa' }}>
          Pujá en tiempo real · Paraguay
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 26, color: '#71717a' }}>renewsubastas.com.py</div>
    </div>,
    size,
  );
}
