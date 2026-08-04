import { requireRole } from '@/lib/auth/server';
import { listAuctions } from '@/lib/staff/list-auctions';
import { AuctionsTable } from './auctions-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function StaffAuctionsList({ params: { locale }, searchParams }: PageProps) {
  // The layout admits finanzas too (for /sales-adjacent nav), so this can't
  // rely on it — enforce staff/admin here. The list itself is intentionally
  // not scoped to the user's uid — staff and admin both see every auction
  // and can act on any of them.
  await requireRole(locale, ['admin', 'staff']);
  const status =
    searchParams?.status === 'scheduled' ||
    searchParams?.status === 'live' ||
    searchParams?.status === 'ended' ||
    searchParams?.status === 'cancelled'
      ? searchParams.status
      : undefined;
  const data = await listAuctions({
    ...(status && { status }),
    ...(searchParams?.cursor && { cursor: searchParams.cursor }),
  });
  return (
    <AuctionsTable
      locale={locale}
      items={data.items}
      nextCursor={data.nextCursor}
      currentStatus={status ?? null}
    />
  );
}
