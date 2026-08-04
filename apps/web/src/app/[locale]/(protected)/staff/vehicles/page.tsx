import { requireRole } from '@/lib/auth/server';
import { listVehicles } from '@/lib/staff/list-vehicles';
import { VehiclesTable } from './vehicles-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function VehiclesListPage({ params: { locale }, searchParams }: PageProps) {
  // Inventory (VIN, plate, acquisition pipeline) is staff/admin territory —
  // finanzas can reach /staff via the layout for other reasons but must not
  // see this.
  const user = await requireRole(locale, ['admin', 'staff']);
  const status =
    searchParams?.status === 'draft' ||
    searchParams?.status === 'ready' ||
    searchParams?.status === 'in_auction' ||
    searchParams?.status === 'sold' ||
    searchParams?.status === 'archived'
      ? searchParams.status
      : undefined;
  // Staff and admin both see every vehicle in the system; the firestore.rules
  // already allow either role to read and update any vehicle. Scoping by uid
  // would only hide useful inventory from a staff user trying to edit a
  // colleague's draft.
  void user;
  const data = await listVehicles({
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <VehiclesTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentStatus={status ?? null}
    />
  );
}
