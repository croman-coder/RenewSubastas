import { getCurrentUser } from '@/lib/auth/server';
import { VehicleForm } from './vehicle-form';

export default async function NewVehiclePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  return <VehicleForm locale={locale} actorUid={user.uid} />;
}
