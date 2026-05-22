import Link from 'next/link';
import { BadgeCheck, CircleAlert, Hourglass, Trophy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { listMyWon } from '@/lib/buyer/list-my-won';
import { getTranslations } from 'next-intl/server';

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PageProps {
  params: { locale: string; audience: 'retail' | 'wholesale' };
}

export default async function MyWonPage({ params: { locale, audience } }: PageProps) {
  const user = await getCurrentUser(locale);
  const items = await listMyWon(user.uid);
  const t = await getTranslations('buyer.won');

  return (
    <div className="space-y-5">
      <header className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          {t('title')}
        </h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center">
          <Trophy className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-text-muted">{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((w, i) => {
            const href = `/${locale}/${audience}/won/${w.auctionId}` as `/${string}`;
            return (
              <li
                key={w.auctionId}
                className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
              >
                <Link href={href} className="flex items-center gap-4 p-4">
                  {w.thumbnailUrl ? (
                    <img
                      src={w.thumbnailUrl}
                      alt=""
                      className="w-20 h-20 object-cover rounded-lg shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-bg-deep rounded-lg shrink-0 grid place-items-center">
                      <Trophy className="w-6 h-6 text-text-muted/40" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-text-strong truncate">
                      {w.make} {w.model}{' '}
                      <span className="text-text-muted num-tab font-normal">{w.year}</span>
                    </p>
                    <p className="text-sm text-text-strong num-tab font-semibold">
                      USD {fmtUsd(w.finalPrice)}
                    </p>
                    <PaymentChip status={w.paymentStatus} deadlineMs={w.paymentDeadlineMs} />
                  </div>
                  <span className="text-xs text-text-muted num-tab shrink-0">
                    {new Date(w.endedAtMs).toLocaleDateString(locale)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PaymentChip({
  status,
  deadlineMs,
}: {
  status: 'pending_payment' | 'paid' | 'forfeited' | null;
  deadlineMs: number | null;
}) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded px-1.5 py-0.5">
        <BadgeCheck className="w-3 h-3" /> Seña confirmada
      </span>
    );
  }
  if (status === 'forfeited') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-danger bg-danger/10 ring-1 ring-danger/20 rounded px-1.5 py-0.5">
        <CircleAlert className="w-3 h-3" /> Liberada
      </span>
    );
  }
  if (status === 'pending_payment') {
    const remaining = deadlineMs ? Math.max(0, deadlineMs - Date.now()) : 0;
    const hours = Math.floor(remaining / 3600_000);
    const minutes = Math.floor((remaining % 3600_000) / 60_000);
    const label =
      remaining === 0
        ? 'Plazo vencido'
        : `Quedan ${hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}`;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 rounded px-1.5 py-0.5">
        <Hourglass className="w-3 h-3" /> {label}
      </span>
    );
  }
  return null;
}
