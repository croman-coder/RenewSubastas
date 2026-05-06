import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-strong">{t('closingSoon')}</h2>
        <Link
          href={`/${locale}/admin` as `/${string}`}
          className="text-xs text-text-muted hover:text-text-strong"
        >
          {t('viewAll')}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{t('noClosingSoon')}</p>
      ) : (
        <ul className="divide-y divide-text-subtle/20">
          {items.map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between text-sm">
              <Link
                href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                className="hover:underline"
              >
                {a.make} {a.model} {a.year}
              </Link>
              <span className="num-tab text-text-muted text-xs">
                USD {a.currentBid.toLocaleString()} · {new Date(a.endsAtMs).toLocaleString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
