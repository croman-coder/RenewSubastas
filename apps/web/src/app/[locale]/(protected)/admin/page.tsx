import { getTranslations } from 'next-intl/server';
import { loadDashboardStats } from '@/lib/admin/load-dashboard-stats';
import { TodayLabel } from '@/components/shell/today-label';
import { KpiCards } from './_components/kpi-cards';
import { AuctionsByStatusChart } from './_components/auctions-by-status-chart';
import { BidsPerDayChart } from './_components/bids-per-day-chart';
import { ClosingSoonList } from './_components/closing-soon-list';
import { RecentAuditList } from './_components/recent-audit-list';

export default async function AdminHome({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('admin.home');
  const s = await loadDashboardStats();

  const usersTotal = s.usersByRole.admin + s.usersByRole.staff + s.usersByRole.buyer;

  return (
    <div className="space-y-8">
      {/* Hero header with gradient accent */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-6 py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div
          aria-hidden
          className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-copper/10 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-violet-500/5 blur-3xl pointer-events-none"
        />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
            <TodayLabel locale={locale} />
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-strong">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-muted max-w-prose">{t('subtitle')}</p>
        </div>
      </header>

      <KpiCards
        usersTotal={usersTotal}
        liveAuctions={s.liveAuctions}
        gmvUsd={s.gmvUsd}
        bidsToday={s.bidsToday}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AuctionsByStatusChart
          live={s.liveAuctions}
          scheduled={s.scheduledAuctions}
          ended={s.endedAuctions}
        />
        <BidsPerDayChart data={s.bidsByDay} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ClosingSoonList locale={locale} items={s.closingSoon} />
        <RecentAuditList locale={locale} items={s.recentAudit} />
      </div>
    </div>
  );
}
