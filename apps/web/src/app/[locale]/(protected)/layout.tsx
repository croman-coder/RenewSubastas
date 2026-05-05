import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, type Role } from '@/lib/auth/constants';
import { LogoutButton } from './logout-button';

interface LayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function ProtectedLayout({ children, params: { locale } }: LayoutProps) {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);

  let role: Role;
  let email = '';
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if ((decoded as { status?: string }).status !== 'active') {
      redirect(`/${locale}/login?error=disabled`);
    }
    role = (decoded as { role?: Role }).role!;
    email = decoded.email ?? '';
  } catch {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <header className="border-b border-text-subtle/20 px-6 py-3 flex items-center justify-between bg-bg-elev">
        <div className="flex items-center gap-3">
          <a href={`/${locale}`} className="font-wordmark font-bold tracking-tight text-xl">
            <span className="text-copper">CAR</span>
            <span className="text-ink">BID</span>
          </a>
          <span className="text-xs uppercase text-text-muted bg-bg-deep rounded px-2 py-0.5">
            {role}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-muted">{email}</span>
          <LogoutButton locale={locale} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
