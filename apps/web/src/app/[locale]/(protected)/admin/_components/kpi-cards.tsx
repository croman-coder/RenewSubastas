import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { Users, Gavel, DollarSign, TrendingUp, type LucideIcon } from 'lucide-react';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday }: Props) {
  const t = useTranslations('admin.home.kpis');
  const items: Array<{ label: string; value: string; icon: LucideIcon; emphasize?: boolean }> = [
    { label: t('activeUsers'), value: usersTotal.toLocaleString(), icon: Users },
    { label: t('liveAuctions'), value: liveAuctions.toLocaleString(), icon: Gavel },
    { label: t('gmv'), value: gmvUsd.toLocaleString(), icon: DollarSign, emphasize: true },
    { label: t('bidsToday'), value: bidsToday.toLocaleString(), icon: TrendingUp },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it, idx) => {
        const Icon = it.icon;
        return (
          <Card
            key={it.label}
            className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wide">
                {it.label}
              </CardTitle>
              <span className="w-8 h-8 rounded-md bg-copper/10 grid place-items-center text-copper">
                <Icon className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <p
                className={
                  'text-3xl font-semibold num-tab ' +
                  (it.emphasize ? 'text-copper' : 'text-text-strong')
                }
              >
                {it.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
