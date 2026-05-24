'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslations } from 'next-intl';
import { PieChart as PieIcon } from 'lucide-react';

interface Props {
  live: number;
  scheduled: number;
  ended: number;
}

// Monochrome series for the B&W brand. Three steps of neutral ink so
// slices read by tonal contrast alone — no chromatic hue leaks back
// into the otherwise grayscale dashboard. Order matches semantic
// hierarchy: live = darkest (most attention), ended = lightest (past).
const SERIES = {
  live: 'oklch(0.18 0 0)',
  scheduled: 'oklch(0.45 0 0)',
  ended: 'oklch(0.74 0 0)',
};

export function AuctionsByStatusChart({ live, scheduled, ended }: Props) {
  const t = useTranslations('admin.home');
  const tStatus = useTranslations('staff.auctions.status');
  const data = [
    { name: tStatus('live'), value: live, color: SERIES.live },
    { name: tStatus('scheduled'), value: scheduled, color: SERIES.scheduled },
    { name: tStatus('ended'), value: ended, color: SERIES.ended },
  ];
  const total = live + scheduled + ended;

  return (
    <section
      className={
        'rounded-xl border border-text-subtle/15 bg-bg-elev/40 ' +
        'transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 ' +
        'animate-in fade-in duration-500'
      }
    >
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-2">
        <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
          <PieIcon className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <h2 className="text-sm font-semibold text-text-strong tracking-tight">
          {t('auctionsByStatus')}
        </h2>
      </header>
      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-[1fr_auto] gap-6 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="transparent"
                  >
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={{ fill: 'oklch(0 0 0 / 0.04)' }}
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
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2.5 text-sm min-w-[120px]">
              {data.map((d) => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <li key={d.name} className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: d.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-text-strong text-xs">{d.name}</p>
                      <p className="text-text-muted text-[11px] num-tab">
                        {d.value} · {pct}%
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
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
        <PieIcon className="w-7 h-7 mx-auto text-text-muted/60 mb-2" strokeWidth={1.5} />
        <p className="text-xs text-text-muted">Sin subastas todavía</p>
      </div>
    </div>
  );
}
