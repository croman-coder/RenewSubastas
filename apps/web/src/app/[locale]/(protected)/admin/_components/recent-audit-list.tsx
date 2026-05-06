import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Activity, History } from 'lucide-react';

interface Props {
  locale: string;
  items: Array<{
    id: string;
    action: string;
    actorUid: string;
    resourceType: string;
    resourceId: string;
    createdAtMs: number;
  }>;
}

const ACTION_TONES: Record<string, { dot: string; text: string }> = {
  'user.create': { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  'user.update': { dot: 'bg-violet-400', text: 'text-violet-300' },
  'user.delete': { dot: 'bg-rose-400', text: 'text-rose-300' },
  'auction.create': { dot: 'bg-copper', text: 'text-copper' },
  'auction.cancel': { dot: 'bg-rose-400', text: 'text-rose-300' },
  'app_config.update': { dot: 'bg-amber-400', text: 'text-amber-300' },
  'bid.place': { dot: 'bg-cyan-400', text: 'text-cyan-300' },
};
const DEFAULT_TONE = { dot: 'bg-text-subtle', text: 'text-text-muted' };

export function RecentAuditList({ locale, items }: Props) {
  const t = useTranslations('admin.home');
  return (
    <section
      className={
        'rounded-xl border border-text-subtle/15 bg-bg-elev/40 ' +
        'transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 ' +
        'animate-in fade-in duration-500'
      }
    >
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-violet-500/10 text-violet-300 grid place-items-center">
            <Activity className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">
            {t('recentAudit')}
          </h2>
        </div>
        <Link
          href={`/${locale}/admin/audit` as `/${string}`}
          className="text-xs text-text-muted hover:text-copper transition-colors"
        >
          {t('viewAll')} →
        </Link>
      </header>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="px-3 pb-3">
          {items.map((e, idx) => {
            const tone = ACTION_TONES[e.action] ?? DEFAULT_TONE;
            return (
              <li
                key={e.id}
                className={
                  'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs ' +
                  'transition-colors hover:bg-bg-deep/60 ' +
                  'animate-in fade-in slide-in-from-bottom-1'
                }
                style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'both' }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + tone.dot} />
                  <span className={'font-mono ' + tone.text}>{e.action}</span>
                  <span className="font-mono text-text-muted/80 truncate">
                    {e.resourceId.slice(0, 8)}
                  </span>
                </span>
                <span className="text-text-muted num-tab shrink-0">
                  {new Date(e.createdAtMs).toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  const t = useTranslations('admin.home');
  return (
    <div className="px-5 pb-6 pt-2">
      <div className="rounded-lg border border-dashed border-text-subtle/20 px-4 py-8 text-center">
        <History className="w-6 h-6 mx-auto text-text-muted/60 mb-2" strokeWidth={1.5} />
        <p className="text-xs text-text-muted">{t('noAudit')}</p>
      </div>
    </div>
  );
}
