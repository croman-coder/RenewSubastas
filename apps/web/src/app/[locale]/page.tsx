import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ROLE_HOME, type Role } from '@/lib/auth/constants';

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if ((decoded as { status?: string }).status !== 'active') {
      redirect(`/${locale}/login?error=disabled`);
    }
    const role = (decoded as { role?: Role }).role!;
    redirect(`/${locale}${ROLE_HOME[role]}`);
  } catch {
    redirect(`/${locale}/login`);
  }
}
