'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTranslations } from 'next-intl';

interface Props {
  live: number;
  scheduled: number;
  ended: number;
}

export function AuctionsByStatusChart({ live, scheduled, ended }: Props) {
  const t = useTranslations('admin.home');
  const tStatus = useTranslations('staff.auctions.status');
  const data = [
    { name: tStatus('live'), value: live, color: 'oklch(60% 0.13 155)' },
    { name: tStatus('scheduled'), value: scheduled, color: 'oklch(70% 0.14 75)' },
    { name: tStatus('ended'), value: ended, color: 'oklch(48% 0.01 290)' },
  ];
  const total = live + scheduled + ended;
  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium text-text-strong">{t('auctionsByStatus')}</h2>
      {total === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">—</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={28} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
