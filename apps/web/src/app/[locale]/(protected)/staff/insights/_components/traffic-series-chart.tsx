'use client';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LineChart as LineIcon } from 'lucide-react';

interface Props {
  /** Oldest first — one point per rolled-up day. */
  data: Array<{ date: string; views: number; sessions: number }>;
  totalViews: number;
  totalSessions: number;
}

// Same monochrome-ink convention as admin/_components/bids-per-day-chart.tsx,
// but reading the actual `--text-*` CSS custom properties instead of
// hardcoded light-mode oklch literals, so the two series stay legible after
// the theme toggle flips to `.dark` (see globals.css) instead of rendering
// near-black ink on a near-black canvas. SVG presentation attributes resolve
// `var()` through the normal CSS cascade, same as any other CSS color value.
const STROKE_VIEWS = 'oklch(var(--text-strong))';
const STROKE_SESSIONS = 'oklch(var(--text-muted))';
const GRID = 'oklch(var(--text-subtle) / 0.3)';
const AXIS = 'oklch(var(--text-muted))';

export function TrafficSeriesChart({ data, totalViews, totalSessions }: Props) {
  // Show only month-day on the X axis, same trick as BidsPerDayChart.
  const formatted = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 h-full">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-1">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
            <LineIcon className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">
            Visitas y sesiones
          </h2>
        </div>
        <span className="text-xs text-text-muted num-tab">
          {totalViews.toLocaleString('es-PY')} vistas · {totalSessions.toLocaleString('es-PY')}{' '}
          sesiones
        </span>
      </header>

      <div className="flex items-center gap-4 px-5 pb-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ backgroundColor: STROKE_VIEWS }}
            aria-hidden
          />
          Visitas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0 border-2"
            style={{ borderColor: STROKE_SESSIONS }}
            aria-hidden
          />
          Sesiones
        </span>
      </div>

      {formatted.length === 0 ? (
        <div className="px-5 pb-6 pt-2">
          <div className="rounded-lg border border-dashed border-text-subtle/20 px-4 py-12 text-center">
            <LineIcon className="w-7 h-7 mx-auto text-text-muted/60 mb-2" strokeWidth={1.5} />
            <p className="text-xs text-text-muted">Sin días agregados todavía</p>
          </div>
        </div>
      ) : (
        <div className="px-2 pb-3">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trafficViewsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STROKE_VIEWS} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={STROKE_VIEWS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS }}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: AXIS }}
                  width={28}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: STROKE_VIEWS, strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: 'oklch(var(--bg-deep))',
                    color: 'oklch(var(--text-strong))',
                    border: '1px solid oklch(var(--text-subtle) / 0.4)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    padding: '6px 10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}
                  itemStyle={{ color: 'oklch(var(--text-strong))' }}
                  labelStyle={{ color: 'oklch(var(--text-muted))', marginBottom: '2px' }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Visitas"
                  stroke={STROKE_VIEWS}
                  strokeWidth={2.25}
                  fill="url(#trafficViewsArea)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    stroke: STROKE_VIEWS,
                    strokeWidth: 2,
                    fill: 'oklch(var(--bg-base))',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  name="Sesiones"
                  stroke={STROKE_SESSIONS}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 3.5,
                    stroke: STROKE_SESSIONS,
                    strokeWidth: 2,
                    fill: 'oklch(var(--bg-base))',
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
