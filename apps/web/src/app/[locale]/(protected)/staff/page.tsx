import { requireRole } from '@/lib/auth/server';

export default async function StaffHome({ params: { locale } }: { params: { locale: string } }) {
  await requireRole(locale, ['admin', 'staff']);
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-text-strong">Staff dashboard</h1>
      <p className="text-text-muted mt-2">Esta sección se construirá en el Plan 4.</p>
    </main>
  );
}
