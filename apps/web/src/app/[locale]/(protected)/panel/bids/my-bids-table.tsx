'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { MyBidEntry } from '@/lib/buyer/list-my-bids';

interface Props {
  locale: string;
  items: MyBidEntry[];
  currentTab: 'winning' | 'outbid' | 'won' | 'lost';
}

export function MyBidsTable({ locale, items, currentTab }: Props) {
  const t = useTranslations('buyer.bids');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();

  function setTab(value: string) {
    router.replace(
      `/${locale}/panel/bids${value === 'winning' ? '' : `?tab=${value}`}` as `/${string}`,
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          {t('title')}
        </h1>
      </header>
      <Tabs value={currentTab} onValueChange={setTab}>
        <TabsList className="overflow-x-auto scrollbar-none">
          <TabsTrigger value="winning">{t('tabs.winning')}</TabsTrigger>
          <TabsTrigger value="outbid">{t('tabs.outbid')}</TabsTrigger>
          <TabsTrigger value="won">{t('tabs.won')}</TabsTrigger>
          <TabsTrigger value="lost">{t('tabs.lost')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center text-sm text-text-muted">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-text-subtle/15 bg-bg-elev/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.vehicle')}</TableHead>
                <TableHead>{t('columns.myBid')}</TableHead>
                <TableHead>{t('columns.currentBid')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead>{t('columns.endsAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => (
                <TableRow key={b.bidId}>
                  <TableCell>
                    <Link
                      href={`/${locale}/auctions/${b.auctionId}` as `/${string}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      {b.thumbnailUrl ? (
                        <img
                          src={b.thumbnailUrl}
                          alt=""
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-bg-deep rounded" />
                      )}
                      <span>
                        {b.make} {b.model} {b.year}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="num-tab">USD {b.myBid.toLocaleString()}</TableCell>
                  <TableCell className="num-tab">USD {b.currentBid.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tStatus(b.auctionStatus)}</Badge>
                  </TableCell>
                  <TableCell className="text-text-muted text-sm num-tab">
                    {new Date(b.endsAtMs).toLocaleString(locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
