import { ImageResponse } from 'next/og';

// Next.js dynamic favicon — rendered as an ImageResponse so it always matches
// the in-app CarbidMark monogram (copper "C" + light "B" on a dark gradient).
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
        background:
          'radial-gradient(circle at 30% 25%, #cd9b4f33 0%, #cd9b4f1a 35%, #2d2935 75%, #1c1923 100%)',
        color: '#f3eee7',
        fontWeight: 800,
        fontSize: 36,
        letterSpacing: -1,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        borderRadius: 14,
      }}
    >
      <span style={{ color: '#cd9b4f' }}>C</span>
      <span style={{ marginLeft: -2 }}>B</span>
    </div>,
    { ...size },
  );
}
