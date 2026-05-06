import { getCurrentUser } from '@/lib/auth/server';
import { listAuctions } from '@/lib/staff/list-auctions';
import { AuctionsTable } from './auctions-table';

interface PageProps {
  params: { locale: string };
  searchParams?: { status?: string; cursor?: string };
}

export default async function StaffAuctionsList({ params: { locale }, searchParams }: PageProps) {
  const user = await getCurrentUser(locale);
  const status =
    searchParams?.status === 'scheduled' ||
    searchParams?.status === 'live' ||
    searchParams?.status === 'ended' ||
    searchParams?.status === 'cancelled'
      ? searchParams.status
      : undefined;
  const data = await listAuctions({
    ...(user.role === 'staff' ? { scopedToUid: user.uid } : {}),
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
