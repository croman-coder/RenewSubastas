'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Gavel } from 'lucide-react';
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
import { bidOutcome, type BidOutcome } from '@/lib/buyer/my-auction-states';
import { minimumBid } from '@/lib/auctions/minimum-bid';
import { formatAmount } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { remainingLabel } from '@/lib/format/remaining';
import { auctionStatusVariant } from '@/lib/format/status-variant';

interface Props {
  locale: string;
  audience: 'retail' | 'wholesale';
  items: MyBidEntry[];
  /** Subastas en vivo donde te superaron, las que cierran antes primero. */
  outbid: MyBidEntry[];
  currentTab: 'winning' | 'outbid' | 'won' | 'lost';
}

const OUTCOME_BADGE: Record<
  BidOutcome,
  { variant: 'success' | 'danger' | 'neutral'; label: string }
> = {
  winning: { variant: 'success', label: 'Ganando' },
  outbid: { variant: 'danger', label: 'Superada' },
  won: { variant: 'success', label: 'Ganada' },
  lost: { variant: 'neutral', label: 'Perdida' },
};

export function MyBidsTable({ locale, audience, items, outbid, currentTab }: Props) {
  const t = useTranslations('buyer.bids');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  // "cierra en …" cambia de a minutos: con un tic cada 30 s alcanza.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function setTab(value: string) {
    router.replace(
      `/${locale}/${audience}/bids${value === 'winning' ? '' : `?tab=${value}`}` as `/${string}`,
    );
  }

  // En el teléfono las superadas van arriba como tarjetas y el historial no
  // las repite (spec 2026-09-27 §5.5).
  const outbidIds = new Set(outbid.map((b) => b.auctionId));
  const history = items.filter((b) => !outbidIds.has(b.auctionId));

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

      {/* Teléfono (< sm): tarjetas de "Te superaron" y el historial. */}
      <div className="space-y-5 sm:hidden">
        {outbid.length > 0 && (
          <ul className="space-y-3">
            {outbid.map((b) => (
              <li key={b.auctionId}>
                <OutbidCard locale={locale} entry={b} nowMs={now} />
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 ? (
          <section aria-labelledby="history-heading" className="space-y-2">
            <h2
              id="history-heading"
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted"
            >
              Historial
            </h2>
            <ul className="divide-y divide-text-subtle/15 overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev">
              {history.map((b) => (
                <li key={b.bidId}>
                  <HistoryRow locale={locale} entry={b} statusLabel={tStatus(b.auctionStatus)} />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          outbid.length === 0 && (
            <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center text-sm text-text-muted">
              {t('empty')}
            </div>
          )
        )}
      </div>

      {/* Desde sm, la tabla de siempre. */}
      <div className="hidden sm:block">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev px-6 py-16 text-center text-sm text-text-muted">
            {t('empty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-text-subtle/15 bg-bg-elev">
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
                    <TableCell className="num-tab">USD {formatAmount(b.myBid)}</TableCell>
                    <TableCell className="num-tab">USD {formatAmount(b.currentBid)}</TableCell>
                    <TableCell>
                      <Badge variant={auctionStatusVariant(b.auctionStatus)}>
                        {tStatus(b.auctionStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted text-sm num-tab">
                      {formatDateTimePy(locale, b.endsAtMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Una subasta en vivo donde te superaron, con el atajo para volver a pujar. */
function OutbidCard({
  locale,
  entry,
  nowMs,
}: {
  locale: string;
  entry: MyBidEntry;
  nowMs: number;
}) {
  // El mismo mínimo que va a pedir la ficha (y que acepta placeBid).
  const next = minimumBid({
    currentBid: entry.currentBid,
    startingPrice: entry.startingPrice,
    bidIncrement: entry.bidIncrement,
  });
  return (
    <article className="space-y-3 rounded-2xl border border-text-subtle/15 bg-bg-elev p-4 shadow-card">
      <div className="flex items-center gap-3">
        {entry.thumbnailUrl ? (
          <img
            src={entry.thumbnailUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-xl bg-bg-deep" />
        )}
        <div className="min-w-0">
          <Badge variant="danger" className="px-2 py-0 text-[10px] uppercase tracking-[0.06em]">
            Te superaron
          </Badge>
          <p className="mt-1 truncate font-bold tracking-tight text-text-strong">
            {entry.make} {entry.model} <span className="num-tab font-normal">{entry.year}</span>
          </p>
          <p suppressHydrationWarning className="num-tab text-xs text-text-muted">
            Ahora USD {formatAmount(entry.currentBid)} · cierra en{' '}
            {remainingLabel(entry.endsAtMs - nowMs)}
          </p>
        </div>
      </div>
      <Link
        href={`/${locale}/auctions/${entry.auctionId}` as `/${string}`}
        className={
          'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-text-strong text-sm font-semibold text-bg-base ' +
          '[touch-action:manipulation] transition-opacity duration-200 hover:opacity-90 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
        }
      >
        <Gavel className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Volver a pujar · USD {formatAmount(next)}
      </Link>
    </article>
  );
}

function HistoryRow({
  locale,
  entry,
  statusLabel,
}: {
  locale: string;
  entry: MyBidEntry;
  statusLabel: string;
}) {
  const outcome = bidOutcome(entry);
  const badge = outcome ? OUTCOME_BADGE[outcome] : null;
  return (
    <Link
      href={`/${locale}/auctions/${entry.auctionId}` as `/${string}`}
      className="flex items-center gap-3 p-3 transition-colors hover:bg-bg-deep/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40"
    >
      {entry.thumbnailUrl ? (
        <img
          src={entry.thumbnailUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-bg-deep" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-strong">
          {entry.make} {entry.model} {entry.year}
        </p>
        <p className="num-tab text-xs text-text-muted">
          Tu puja USD {formatAmount(entry.myBid)} · {formatDateTimePy(locale, entry.bidCreatedAtMs)}
        </p>
      </div>
      {badge ? (
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      ) : (
        // Programada o cancelada: sin resultado propio, se muestra el estado.
        <Badge variant={auctionStatusVariant(entry.auctionStatus)} className="shrink-0">
          {statusLabel}
        </Badge>
      )}
    </Link>
  );
}
