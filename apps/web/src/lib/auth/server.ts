import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ROLE_HOME, type Role } from './constants';

export interface CurrentUser {
  uid: string;
  role: Role;
  email: string;
}

export async function getCurrentUser(locale: string): Promise<CurrentUser> {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const status = (decoded as { status?: string }).status;
    if (status !== 'active') redirect(`/${locale}/login?error=disabled`);
    const role = (decoded as { role?: Role }).role;
    if (!role) redirect(`/${locale}/login?error=no_role`);
    return { uid: decoded.uid, role, email: decoded.email ?? '' };
  } catch {
    redirect(`/${locale}/login`);
  }
}

export async function requireRole(locale: string, allowed: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser(locale);
  if (!allowed.includes(user.role)) redirect(`/${locale}${ROLE_HOME[user.role]}`);
  return user;
}
