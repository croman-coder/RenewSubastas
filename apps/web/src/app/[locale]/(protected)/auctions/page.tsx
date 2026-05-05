import { requireRole } from '@/lib/auth/server';

export default async function BuyerAuctionsHome({
  params: { locale },
}: {
  params: { locale: string };
}) {
  await requireRole(locale, ['admin', 'staff', 'buyer']);
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-text-strong">Subastas</h1>
      <p className="text-text-muted mt-2">Catálogo de subastas. Plan 5.</p>
    </main>
  );
}
