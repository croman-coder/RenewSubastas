import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const LOCALES = ['es', 'en'] as const;
type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async ({ locale }) => {
  if (!LOCALES.includes(locale as Locale)) notFound();
  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

export { LOCALES };
