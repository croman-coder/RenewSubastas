'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { LineChart as LineIcon } from 'lucide-react';

interface Props {
  data: Array<{ date: string; count: number }>;
}

// Single ink series for the B&W brand — pure neutral stroke so the
// trend reads on its own without competing with the rest of the
// monochrome dashboard. Gradient fades to transparent so the area
// fill never overpowers underlying gridlines.
const INK = 'oklch(0.18 0 0)';
const INK_GRID = 'oklch(0.5 0 0 / 0.18)';
const INK_AXIS = 'oklch(0.42 0 0)';

export function BidsPerDayChart({ data }: Props) {
  const t = useTranslations('admin.home');
  const totalBids = data.reduce((acc, d) => acc + d.count, 0);
  const maxCount = data.reduce((m, d) => Math.max(m, d.count), 0);
  // Show only month-day on the X axis
  const formatted = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <section
      className={
        'rounded-xl border border-text-subtle/15 bg-bg-elev/40 ' +
        'transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 ' +
        'animate-in fade-in duration-500'
      }
    >
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
            <LineIcon className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">
            {t('bidsPerDay')}
          </h2>
        </div>
        <span className="text-xs text-text-muted num-tab">
          {totalBids.toLocaleString()} en 30d · pico {maxCount}
        </span>
      </header>
      {totalBids === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-2 pb-3">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bidsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INK} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={INK} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={INK_GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: INK_AXIS }}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: INK_AXIS }}
                  width={28}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: 'oklch(0.1 0 0)',
                    color: 'oklch(0.98 0 0)',
                    border: '1px solid oklch(0.4 0 0)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    padding: '6px 10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}
                  itemStyle={{ color: 'oklch(0.98 0 0)' }}
                  labelStyle={{ color: 'oklch(0.85 0 0)', marginBottom: '2px' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={INK}
                  strokeWidth={2.25}
                  fill="url(#bidsArea)"
                  dot={false}
                  activeDot={{ r: 4, stroke: INK, strokeWidth: 2, fill: 'oklch(1 0 0)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="px-5 pb-6 pt-2">
      <div className="rounded-lg border border-dashed border-text-subtle/20 px-4 py-12 text-center">
        <LineIcon className="w-7 h-7 mx-auto text-text-muted/60 mb-2" strokeWidth={1.5} />
        <p className="text-xs text-text-muted">Sin pujas en los últimos 30 días</p>
      </div>
    </div>
  );
}
