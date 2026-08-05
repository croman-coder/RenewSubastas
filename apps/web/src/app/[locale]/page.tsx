import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/server';
import { homeFor } from '@/lib/auth/constants';
import { listPublicAuctions } from '@/lib/buyer/list-public-auctions';
import { loadCompany } from '@/lib/legal/load-company';
import { PublicLanding } from '@/components/public/public-landing';
import { OrganizationJsonLd } from '@/components/seo/organization-json-ld';
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from '@/lib/seo/site';

const TITLE = 'Subastas de vehículos usados certificados · Renew Subastas';
const DESCRIPTION =
  'Subastá vehículos usados certificados por Santa Rosa en Paraguay. Mirá las unidades disponibles, seguí las pujas en tiempo real y participá desde tu cuenta.';

/**
 * The root page inherited the layout's generic title and shipped no Open
 * Graph at all, so every share of the site rendered as a bare link. Now that
 * the landing is public it is the page most likely to be linked.
 */
export function generateMetadata({ params: { locale } }: { params: { locale: string } }): Metadata {
  const path = `${SITE_URL}/${locale}`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: path,
      languages: Object.fromEntries([
        ...LOCALES.map((l) => [l, `${SITE_URL}/${l}`]),
        ['x-default', `${SITE_URL}/${DEFAULT_LOCALE}`],
      ]),
    },
    openGraph: {
      type: 'website',
      siteName: 'Renew Subastas',
      title: TITLE,
      description: DESCRIPTION,
      url: path,
      locale: locale === 'en' ? 'en_US' : 'es_PY',
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  };
}

/**
 * Root route. Signed-in users go straight to their role's home; everyone else
 * gets the public auction landing instead of being bounced to /login.
 *
 * The catalog is read with the Admin SDK (`listPublicAuctions` is
 * server-only), which bypasses Firestore rules — so opening this page to
 * anonymous visitors did NOT require loosening `firestore.rules`. A browser
 * still cannot read `auctions` directly without an authenticated,
 * audience-matching session.
 *
 * `audience: 'retail'` is hardcoded and must stay that way: wholesale is a
 * closed segment and must never be visible to an anonymous visitor.
 */
export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getOptionalUser();
  if (user) redirect(`/${locale}${homeFor(user.role, user.audience)}`);

  const [items, company] = await Promise.all([
    listPublicAuctions({ tab: 'all', audience: 'retail' }),
    loadCompany(),
  ]);
  return (
    <>
      <OrganizationJsonLd locale={locale} company={company} />
      <PublicLanding locale={locale} items={items} company={company} />
    </>
  );
}
