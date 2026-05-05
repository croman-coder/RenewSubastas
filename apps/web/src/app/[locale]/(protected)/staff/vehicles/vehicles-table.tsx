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
import type { VehicleListItem } from '@/lib/staff/list-vehicles';

interface Props {
  locale: string;
  items: VehicleListItem[];
  nextCursor: string | null;
  currentStatus: VehicleListItem['status'] | null;
}

export function VehiclesTable({ locale, items, nextCursor, currentStatus }: Props) {
  const t = useTranslations('staff.vehicles');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/staff/vehicles?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/staff/vehicles?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <Link href={`/${locale}/staff/vehicles/new` as `/${string}`}>
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
          <SelectItem value="draft">{t('status.draft')}</SelectItem>
          <SelectItem value="ready">{t('status.ready')}</SelectItem>
          <SelectItem value="in_auction">{t('status.in_auction')}</SelectItem>
          <SelectItem value="sold">{t('status.sold')}</SelectItem>
          <SelectItem value="archived">{t('status.archived')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.vehicle')}</TableHead>
              <TableHead>{t('columns.year')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.createdAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link
                    href={`/${locale}/staff/vehicles/${v.id}` as `/${string}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-bg-deep rounded" />
                    )}
                    <span>
                      {v.make} {v.model}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="num-tab">{v.year}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(`status.${v.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(v.createdAt).toLocaleDateString(locale)}
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
