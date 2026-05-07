import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { homeFor } from '@/lib/auth/constants';

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getCurrentUser(locale);
  redirect(`/${locale}${homeFor(user.role, user.audience)}`);
}
