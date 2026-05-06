import { ImageResponse } from 'next/og';

// Apple touch icon (180×180) used when iOS users add the site to their
// home screen. Same brand monogram as the favicon, scaled up.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 30% 25%, #cd9b4f3a 0%, #cd9b4f1f 35%, #2d2935 75%, #1c1923 100%)',
        color: '#f3eee7',
        fontWeight: 800,
        fontSize: 102,
        letterSpacing: -3,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        borderRadius: 36,
      }}
    >
      <span style={{ color: '#cd9b4f' }}>C</span>
      <span style={{ marginLeft: -6 }}>B</span>
    </div>,
    { ...size },
  );
}
