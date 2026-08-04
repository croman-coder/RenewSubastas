import { requireRole } from '@/lib/auth/server';
import { VehicleForm } from './vehicle-form';

export default async function NewVehiclePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  // firestore.rules already blocks finanzas from writing vehicles, but the
  // page itself must not render the form (and its data) for them either.
  const user = await requireRole(locale, ['admin', 'staff']);
  return <VehicleForm locale={locale} actorUid={user.uid} />;
}
