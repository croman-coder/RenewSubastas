import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

// Cabeceras de seguridad que producción NO mandaba (auditoría 2026-09-15:
// sólo llegaban HSTS y nosniff). Son las que no pueden romper nada:
//
// - frame-ancestors 'none' + X-Frame-Options DENY: nadie puede meter el login
//   ni el panel de puja en un iframe (clickjacking). La app no se embebe en
//   ningún lado, así que negar todo es la respuesta correcta.
// - Referrer-Policy: las URLs de subasta y los enlaces con utm no viajan
//   completos a terceros; el mismo origen sigue viendo la ruta entera, que es
//   lo que el contador de tráfico necesita.
// - Permissions-Policy: la app no usa micrófono, geolocalización ni Payment
//   Request. La cámara queda FUERA de la lista a propósito: el comprobante se
//   sube con <input type=file>, que no depende de esta política, pero un
//   futuro flujo de foto in-page sí, y no vale la pena cerrarla por nada.
// - HSTS con includeSubDomains: el header ya existía sin ese flag.
//
// Lo que NO está acá es una Content-Security-Policy completa (script-src,
// connect-src…). Hace falta, pero requiere nonces y una allowlist exacta de
// Firebase/Google APIs, Sentry (túnel /monitoring), Meta Pixel y Google Fonts;
// mal hecha rompe el login. Va como trabajo aparte, no como línea en un
// commit de auditoría.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@carbid/shared-types', '@carbid/firebase-client'],
  experimental: { typedRoutes: true },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  webpack(config) {
    // Allow TypeScript ESM packages that use .js extensions in their re-exports
    // (e.g. @carbid/shared-types uses `export * from './foo.js'` per ESM convention)
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

const withSentry = (cfg) =>
  withSentryConfig(cfg, {
    org: 'carbid',
    project: 'carbid-web',
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: '/monitoring',
    disableLogger: true,
    webpack: {
      // Do NOT instrument the Next.js middleware. Sentry's middleware
      // wrapper drags the full SDK + @opentelemetry/api (which pulls
      // `node:async_hooks`, `process`, and dynamic `require`s) into the
      // middleware bundle. On Vercel that runs on the Edge Runtime fine,
      // but Renew is deployed on Netlify, whose edge functions run on
      // Deno — that heavy, Node-oriented bundle intermittently fails to
      // boot there and surfaces as "edge function invocation failed",
      // taking down every page route (the middleware matches all of them).
      // Client- and server-side Sentry stay on; we only lose middleware-
      // level tracing, which we don't rely on.
      autoInstrumentMiddleware: false,
    },
  });

export default withSentry(withNextIntl(nextConfig));
