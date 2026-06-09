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
  // admin + staff manage inventory/auctions. finanzas is allowed in too
  // because the auction-detail page (reached from the sales ledger) is
  // where it confirms/releases seña. Page-level guards keep finanzas
  // out of create/edit actions; the confirm button is gated separately.
  await requireRole(locale, ['admin', 'staff', 'finanzas']);
  return <>{children}</>;
}
