import { ImageResponse } from 'next/og';

// Next.js dynamic favicon — rendered as an ImageResponse so it always
// matches the in-app RenewMark monogram (solid black chip, white "r").
// Saves us from shipping a static .ico that drifts away from the brand
// whenever the palette changes.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontWeight: 700,
        fontSize: 44,
        letterSpacing: -2,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        borderRadius: 14,
      }}
    >
      r
    </div>,
    { ...size },
  );
}
