import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@carbid/shared-types', '@carbid/firebase-client'],
  experimental: { typedRoutes: true },
};

export default withNextIntl(nextConfig);
