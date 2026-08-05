import { redirect } from 'next/navigation';
import { getOptionalUser } from '@/lib/auth/server';
import { homeFor } from '@/lib/auth/constants';
import { listPublicAuctions } from '@/lib/buyer/list-public-auctions';
import { loadCompany } from '@/lib/legal/load-company';
import { PublicLanding } from '@/components/public/public-landing';

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
  return <PublicLanding locale={locale} items={items} company={company} />;
}
