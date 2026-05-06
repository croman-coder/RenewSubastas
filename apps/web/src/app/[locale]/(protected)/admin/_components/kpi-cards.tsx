import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday }: Props) {
  const t = useTranslations('admin.home.kpis');
  const items = [
    { label: t('activeUsers'), value: usersTotal.toLocaleString() },
    { label: t('liveAuctions'), value: liveAuctions.toLocaleString() },
    { label: t('gmv'), value: gmvUsd.toLocaleString() },
    { label: t('bidsToday'), value: bidsToday.toLocaleString() },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader>
            <CardTitle className="text-xs text-text-muted font-normal uppercase tracking-wide">
              {it.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-text-strong num-tab">{it.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
