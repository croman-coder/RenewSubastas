import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, Timer } from 'lucide-react';

interface Props {
  locale: string;
  items: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    currentBid: number;
    endsAtMs: number;
  }>;
}

export function ClosingSoonList({ locale, items }: Props) {
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
          <span className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-300 grid place-items-center">
            <Timer className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">
            {t('closingSoon')}
          </h2>
        </div>
        <Link
          href={`/${locale}/staff/auctions` as `/${string}`}
          className="text-xs text-text-muted hover:text-copper transition-colors"
        >
          {t('viewAll')} →
        </Link>
      </header>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="px-3 pb-3">
          {items.map((a, idx) => {
            const remainingMs = a.endsAtMs - Date.now();
            const urgent = remainingMs > 0 && remainingMs < 60 * 60 * 1000;
            return (
              <li
                key={a.id}
                className="animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
              >
                <Link
                  href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                  className={
                    'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ' +
                    'transition-colors hover:bg-bg-deep/60 group'
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-text-strong group-hover:text-copper transition-colors truncate">
                      {a.make} {a.model}{' '}
                      <span className="text-text-muted num-tab font-normal">{a.year}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="num-tab text-xs text-text-muted">
                      USD {a.currentBid.toLocaleString()}
                    </span>
                    <span
                      className={
                        'inline-flex items-center gap-1 text-xs num-tab ' +
                        (urgent ? 'text-amber-300 font-medium' : 'text-text-muted')
                      }
                    >
                      <Clock className="w-3 h-3" />
                      {formatRemaining(remainingMs, locale)}
                    </span>
                  </span>
                </Link>
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
        <Timer className="w-6 h-6 mx-auto text-text-muted/60 mb-2" strokeWidth={1.5} />
        <p className="text-xs text-text-muted">{t('noClosingSoon')}</p>
      </div>
    </div>
  );
}

function formatRemaining(ms: number, locale: string): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(totalSec / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes >= 1) return `${minutes}m`;
  return locale === 'en' ? '<1m' : '<1m';
}
