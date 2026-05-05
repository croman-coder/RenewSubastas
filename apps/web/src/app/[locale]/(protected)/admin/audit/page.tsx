import { listAudit } from '@/lib/admin/list-audit';
import { AuditTable } from './audit-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { action?: string; cursor?: string };
}

export default async function AuditPage({ params: { locale }, searchParams }: PageProps) {
  const data = await listAudit({
    ...(searchParams?.action && { action: searchParams.action }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <AuditTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentAction={searchParams?.action ?? null}
    />
  );
}
