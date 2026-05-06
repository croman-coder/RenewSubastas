import { getCurrentUser } from '@/lib/auth/server';
import { listAuctions } from '@/lib/staff/list-auctions';
import { AuctionsTable } from './auctions-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function StaffAuctionsList({ params: { locale }, searchParams }: PageProps) {
  // Auth gate (also enforces "staff or admin" via the layout). The list itself
  // is intentionally not scoped to the user's uid — staff and admin both see
  // every auction and can act on any of them.
  await getCurrentUser(locale);
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
