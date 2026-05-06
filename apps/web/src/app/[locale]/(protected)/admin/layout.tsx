import { requireRole } from '@/lib/auth/server';

export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Role gate only — navigation is owned by the global AppShell so admin pages
  // don't render a duplicate sidebar.
  await requireRole(locale, ['admin']);
  return <>{children}</>;
}
