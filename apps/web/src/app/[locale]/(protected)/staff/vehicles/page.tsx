import { getCurrentUser } from '@/lib/auth/server';
import { listVehicles } from '@/lib/staff/list-vehicles';
import { VehiclesTable } from './vehicles-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function VehiclesListPage({ params: { locale }, searchParams }: PageProps) {
  const user = await getCurrentUser(locale);
  const status =
    searchParams?.status === 'draft' ||
    searchParams?.status === 'ready' ||
    searchParams?.status === 'in_auction' ||
    searchParams?.status === 'sold' ||
    searchParams?.status === 'archived'
      ? searchParams.status
      : undefined;
  const data = await listVehicles({
    ...(user.role === 'staff' ? { scopedToUid: user.uid } : {}),
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
