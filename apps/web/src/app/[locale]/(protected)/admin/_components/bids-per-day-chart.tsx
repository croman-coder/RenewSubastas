'use client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';

interface Props {
  data: Array<{ date: string; count: number }>;
}

export function BidsPerDayChart({ data }: Props) {
  const t = useTranslations('admin.home');
  const totalBids = data.reduce((acc, d) => acc + d.count, 0);
  // Show only month-day on the X axis
  const formatted = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3 transition-shadow duration-200 hover:shadow-md animate-in fade-in duration-500">
      <h2 className="text-sm font-medium text-text-strong">{t('bidsPerDay')}</h2>
      {totalBids === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">—</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(64% 0.01 290 / 0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="oklch(68% 0.13 55)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
