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
  });

export default withSentry(withNextIntl(nextConfig));
