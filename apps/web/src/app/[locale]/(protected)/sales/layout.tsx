import { requireRole } from '@/lib/auth/server';

export default async function SalesLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Sales ledger is reachable by admin (full access) and finanzas (the
  // payment-confirmation role). Staff manage inventory elsewhere; they
  // don't need the financial ledger.
  await requireRole(locale, ['admin', 'finanzas']);
  return <>{children}</>;
}
