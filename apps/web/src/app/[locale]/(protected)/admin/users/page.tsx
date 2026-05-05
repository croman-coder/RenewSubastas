import { listUsers } from '@/lib/admin/list-users';
import { UsersTable } from './users-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { role?: string; status?: string; cursor?: string };
}

export default async function UsersListPage({ params: { locale }, searchParams }: PageProps) {
  const role =
    searchParams?.role === 'admin' ||
    searchParams?.role === 'staff' ||
    searchParams?.role === 'buyer'
      ? searchParams.role
      : undefined;
  const status =
    searchParams?.status === 'active' || searchParams?.status === 'disabled'
      ? searchParams.status
      : undefined;
  const data = await listUsers({
    ...(role && { role }),
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <UsersTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentRole={role ?? null}
      currentStatus={status ?? null}
    />
  );
}
