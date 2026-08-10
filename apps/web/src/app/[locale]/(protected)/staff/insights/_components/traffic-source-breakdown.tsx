import { Share2 } from 'lucide-react';
import { SOURCE_LABEL } from '@/lib/insights/format';
import type { Source } from '@/lib/insights/traffic-summary';

interface Props {
  bySource: Record<Source, number>;
  /** Days folded into `bySource`, for the subtitle only. */
  days: number;
}

const SOURCE_ORDER: readonly Source[] = ['ig', 'fb', 'google', 'direct', 'other'];

// Same monochrome-by-tonal-contrast convention as
// admin/_components/auctions-by-status-chart.tsx: darkest first. Order here
// is "most relevant to ad spend" first (ig/fb are what Santa Rosa pays for),
// not alphabetical.
const SOURCE_TONE: Record<Source, string> = {
  ig: 'bg-text-strong',
  fb: 'bg-text-strong/75',
  google: 'bg-text-strong/50',
  direct: 'bg-text-strong/30',
  other: 'bg-text-strong/15',
};

/** No client component/recharts needed — plain bars answer "where from"
 *  just as well as a donut would, at zero extra client JS. */
export function TrafficSourceBreakdown({ bySource, days }: Props) {
  const total = SOURCE_ORDER.reduce((acc, s) => acc + bySource[s], 0);

  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 h-full">
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-1">
        <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
          <Share2 className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">Origen</h2>
          <p className="text-xs text-text-muted">
            Vistas por origen · últimos {days} día{days === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <div className="px-5 pb-6 pt-2">
          <p className="text-xs text-text-muted">Sin vistas registradas en el período.</p>
        </div>
      ) : (
        <ul className="px-5 pb-5 pt-3 space-y-3">
          {SOURCE_ORDER.map((s) => {
            const value = bySource[s];
            const sharePct = Math.round((value / total) * 100);
            return (
              <li key={s} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-strong">{SOURCE_LABEL[s]}</span>
                  <span className="num-tab text-text-muted">
                    {value.toLocaleString('es-PY')} · {sharePct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-deep/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${SOURCE_TONE[s]}`}
                    style={{ width: `${sharePct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
