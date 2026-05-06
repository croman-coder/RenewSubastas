import { Trophy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { listMyWon } from '@/lib/buyer/list-my-won';
import { getTranslations } from 'next-intl/server';

export default async function MyWonPage({ params: { locale } }: { params: { locale: string } }) {
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
          {items.map((w, i) => (
            <li
              key={w.auctionId}
              className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-4 flex items-center gap-4 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in slide-in-from-bottom-1"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
            >
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
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="font-medium text-text-strong truncate">
                  {w.make} {w.model}{' '}
                  <span className="text-text-muted num-tab font-normal">{w.year}</span>
                </p>
                <p className="text-sm text-copper num-tab font-semibold">
                  USD {w.finalPrice.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {t('columns.seller')}: {w.sellerName} · {w.sellerEmail}
                </p>
              </div>
              <span className="text-xs text-text-muted num-tab shrink-0">
                {new Date(w.endedAtMs).toLocaleDateString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
