'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuctionListItem } from '@/lib/staff/list-auctions';

interface Props {
  locale: string;
  items: AuctionListItem[];
  nextCursor: string | null;
  currentStatus: AuctionListItem['status'] | null;
}

export function AuctionsTable({ locale, items, nextCursor, currentStatus }: Props) {
  const t = useTranslations('staff.auctions');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/staff/auctions?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/staff/auctions?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <Link href={`/${locale}/staff/auctions/new` as `/${string}`}>
          <Button>{t('createNew')}</Button>
        </Link>
      </header>
      <Select
        value={currentStatus ?? 'all'}
        onValueChange={(v) => setParam('status', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          <SelectItem value="scheduled">{t('status.scheduled')}</SelectItem>
          <SelectItem value="live">{t('status.live')}</SelectItem>
          <SelectItem value="ended">{t('status.ended')}</SelectItem>
          <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.vehicle')}</TableHead>
              <TableHead>{t('columns.currentBid')}</TableHead>
              <TableHead>{t('columns.bidCount')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.endsAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link
                    href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    {a.thumbnailUrl ? (
                      <img src={a.thumbnailUrl} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-bg-deep rounded" />
                    )}
                    <span>
                      {a.make} {a.model} {a.year}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="num-tab">
                  USD {(a.currentBid > 0 ? a.currentBid : a.startingPrice).toLocaleString()}
                </TableCell>
                <TableCell className="num-tab">{a.bidCount}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(`status.${a.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(a.endsAt).toLocaleString(locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button variant="outline" onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}
