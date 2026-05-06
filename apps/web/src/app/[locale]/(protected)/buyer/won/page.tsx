import { getCurrentUser } from '@/lib/auth/server';
import { listMyWon } from '@/lib/buyer/list-my-won';
import { getTranslations } from 'next-intl/server';

export default async function MyWonPage({ params: { locale } }: { params: { locale: string } }) {
  const user = await getCurrentUser(locale);
  const items = await listMyWon(user.uid);
  const t = await getTranslations('buyer.won');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      {items.length === 0 ? (
        <div className="border border-text-subtle/20 rounded-lg p-12 text-center text-text-muted">
          {t('empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((w) => (
            <li
              key={w.auctionId}
              className="border border-text-subtle/20 rounded-lg p-4 flex items-center gap-4"
            >
              {w.thumbnailUrl && (
                <img src={w.thumbnailUrl} alt="" className="w-20 h-20 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-strong">
                  {w.make} {w.model} {w.year}
                </p>
                <p className="text-sm text-text-muted">
                  {t('columns.finalPrice')}: USD {w.finalPrice.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted">
                  {t('columns.seller')}: {w.sellerName} · {w.sellerEmail}
                </p>
              </div>
              <span className="text-xs text-text-muted num-tab">
                {new Date(w.endedAtMs).toLocaleDateString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
