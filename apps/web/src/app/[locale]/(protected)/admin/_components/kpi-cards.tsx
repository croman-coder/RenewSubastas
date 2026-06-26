'use client';

import { useTranslations } from 'next-intl';
import { Users, Gavel, DollarSign, TrendingUp } from 'lucide-react';
import { KpiCard } from '@/components/brand/kpi-card';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
  /** Last-30d bid counts, oldest -> newest, for the bids sparkline. */
  bidsSpark?: number[];
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday, bidsSpark }: Props) {
  const t = useTranslations('admin.home.kpis');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        index={0}
        label={t('activeUsers')}
        value={usersTotal}
        icon={<Users className="w-5 h-5" strokeWidth={2.25} />}
        caption="Total con sesión activa"
      />
      <KpiCard
        index={1}
        label={t('liveAuctions')}
        value={liveAuctions}
        icon={<Gavel className="w-5 h-5" strokeWidth={2.25} />}
        caption="Subastas en curso"
      />
      <KpiCard
        index={2}
        label={t('gmv')}
        value={gmvUsd}
        prefix="USD "
        icon={<DollarSign className="w-5 h-5" strokeWidth={2.25} />}
        emphasis="solid"
        caption="Valor bruto vendido"
      />
      <KpiCard
        index={3}
        label={t('bidsToday')}
        value={bidsToday}
        icon={<TrendingUp className="w-5 h-5" strokeWidth={2.25} />}
        caption="Pujas en las últimas 24h"
        {...(bidsSpark && bidsSpark.length >= 2 ? { spark: bidsSpark } : {})}
      />
    </div>
  );
}
