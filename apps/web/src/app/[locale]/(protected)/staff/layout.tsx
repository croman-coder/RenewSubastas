import { requireRole } from '@/lib/auth/server';

export default async function StaffLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Role gate only — admin and staff both pass. The AppShell renders the
  // appropriate sidebar (admin sees the full admin nav, staff sees the trim).
  await requireRole(locale, ['admin', 'staff']);
  return <>{children}</>;
}
