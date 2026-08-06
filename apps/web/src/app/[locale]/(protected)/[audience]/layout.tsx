import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';

interface Props {
  children: React.ReactNode;
  params: { locale: string; audience: string };
}

/**
 * Gate for the buyer-facing dashboard tree.
 *
 * The dynamic segment `[audience]` only accepts the strings `retail` and
 * `wholesale`. Any other path falls through to notFound() so we don't
 * accidentally render this tree on stray URLs like `/foo`.
 *
 * NOTE: for a SIGNED-OUT visitor this notFound() never runs — layouts render
 * outside-in and the parent (protected) layout's getCurrentUser() redirects
 * to /login first. Unknown segments are therefore rejected earlier, in
 * middleware.ts; see the KNOWN_SEGMENTS note there. Constraining the params
 * here instead (dynamicParams=false + generateStaticParams) was tried and
 * does NOT work: these pages read cookies(), so nothing can be statically
 * generated and every audience 404s, including the real ones.
 *
 * Authorization model:
 *   - Buyers may only visit their own audience. Visiting the other side
 *     redirects to their actual home so a wholesale account can't see
 *     retail inventory just by typing the URL.
 *   - Admin and staff may visit either side — useful for QA, support, and
 *     verifying inventory placement.
 */
export default async function AudienceLayout({ children, params: { locale, audience } }: Props) {
  if (audience !== 'retail' && audience !== 'wholesale') {
    notFound();
  }
  const user = await getCurrentUser(locale);
  if (user.role === 'buyer' && user.audience && user.audience !== audience) {
    redirect(`/${locale}/${user.audience}`);
  }
  return <>{children}</>;
}
