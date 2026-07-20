import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@carbid/shared-types', '@carbid/firebase-client'],
  experimental: { typedRoutes: true },
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
