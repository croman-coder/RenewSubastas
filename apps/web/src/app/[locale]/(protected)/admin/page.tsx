import { getTranslations } from 'next-intl/server';
import { loadDashboardStats } from '@/lib/admin/load-dashboard-stats';
import { TodayLabel } from '@/components/shell/today-label';
import { KpiCards } from './_components/kpi-cards';
import { AuctionsByStatusChart } from './_components/auctions-by-status-chart';
import { BidsPerDayChart } from './_components/bids-per-day-chart';
import { ClosingSoonList } from './_components/closing-soon-list';
import { RecentAuditList } from './_components/recent-audit-list';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { loadBatchClock } from '@/lib/auctions/load-batch-clock';

export default async function AdminHome({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('admin.home');
  const [s, clock] = await Promise.all([loadDashboardStats(), loadBatchClock()]);

  const usersTotal = s.usersByRole.admin + s.usersByRole.staff + s.usersByRole.buyer;

  return (
    <div className="space-y-8">
      {/* Hero header with gradient accent + subtle 3D robot on wide screens */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-6 py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div
          aria-hidden
          className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-copper/10 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-text-strong/5 blur-3xl pointer-events-none"
        />
        <div className="relative z-10">
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
            <TodayLabel locale={locale} />
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-strong">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-muted max-w-prose">{t('subtitle')}</p>
        </div>
      </header>

      {/* Batch clock. Lotes close together, so the deadline leads the panel. */}
      {clock !== null && <BatchCountdown endsAtMs={clock.at} mode={clock.mode} />}

      <KpiCards
        usersTotal={usersTotal}
        liveAuctions={s.liveAuctions}
        gmvUsd={s.gmvUsd}
        bidsToday={s.bidsToday}
        bidsSpark={s.bidsByDay.map((d) => d.count)}
      />

      {/* Bento grid: asymmetric tiles. Bids chart and audit feed get the wide
          columns; status donut and closing-soon take the narrower ones. Each
          tile stretches to the row height and fades in with a small stagger. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-6 [&>*]:animate-in [&>*]:fade-in [&>*]:slide-in-from-bottom-2 [&>*]:duration-500 [&>*]:fill-mode-both">
        <div className="lg:col-span-2 [&>*]:h-full" style={{ animationDelay: '60ms' }}>
          <AuctionsByStatusChart
            live={s.liveAuctions}
            scheduled={s.scheduledAuctions}
            ended={s.endedAuctions}
          />
        </div>
        <div className="lg:col-span-4 [&>*]:h-full" style={{ animationDelay: '120ms' }}>
          <BidsPerDayChart data={s.bidsByDay} />
        </div>
        <div className="lg:col-span-3 [&>*]:h-full" style={{ animationDelay: '180ms' }}>
          <ClosingSoonList locale={locale} items={s.closingSoon} />
        </div>
        <div className="lg:col-span-3 [&>*]:h-full" style={{ animationDelay: '240ms' }}>
          <RecentAuditList locale={locale} items={s.recentAudit} />
        </div>
      </div>
    </div>
  );
}
