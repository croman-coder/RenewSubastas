import { listUsers } from '@/lib/admin/list-users';
import { isUsersKind, isUsersStatus } from '@/lib/admin/users-filter';
import { UsersTable } from './users-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { kind?: string; status?: string; cursor?: string };
}

export default async function UsersListPage({ params: { locale }, searchParams }: PageProps) {
  const kind = isUsersKind(searchParams?.kind) ? searchParams.kind : undefined;
  const status = isUsersStatus(searchParams?.status) ? searchParams.status : undefined;
  const data = await listUsers({
    ...(kind && { kind }),
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <UsersTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      totalCount={data.totalCount}
      currentKind={kind ?? null}
      currentStatus={status ?? null}
    />
  );
}
