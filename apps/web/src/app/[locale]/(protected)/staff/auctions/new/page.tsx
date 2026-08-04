import { requireRole } from '@/lib/auth/server';
import { listReadyVehicles } from '@/lib/staff/list-ready-vehicles';
import { CreateAuctionForm } from './create-auction-form';

export default async function NewAuctionPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireRole(locale, ['admin', 'staff']);
  const vehicles = await listReadyVehicles(user.uid);
  return <CreateAuctionForm locale={locale} vehicles={vehicles} />;
}
