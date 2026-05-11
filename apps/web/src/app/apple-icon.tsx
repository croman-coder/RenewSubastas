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
        background: '#000',
        color: '#fff',
        fontWeight: 700,
        fontSize: 124,
        letterSpacing: -6,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        borderRadius: 36,
      }}
    >
      r
    </div>,
    { ...size },
  );
}
