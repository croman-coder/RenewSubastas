import { getTranslations } from 'next-intl/server';
import { loadDashboardStats } from '@/lib/admin/load-dashboard-stats';
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
    <div className="space-y-6">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <KpiCards
        usersTotal={usersTotal}
        liveAuctions={s.liveAuctions}
        gmvUsd={s.gmvUsd}
        bidsToday={s.bidsToday}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AuctionsByStatusChart
          live={s.liveAuctions}
          scheduled={s.scheduledAuctions}
          ended={s.endedAuctions}
        />
        <BidsPerDayChart data={s.bidsByDay} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClosingSoonList locale={locale} items={s.closingSoon} />
        <RecentAuditList locale={locale} items={s.recentAudit} />
      </div>
    </div>
  );
}
