import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

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

export function RecentAuditList({ locale, items }: Props) {
  const t = useTranslations('admin.home');
  return (
    <div className="border border-text-subtle/20 rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-strong">{t('recentAudit')}</h2>
        <Link
          href={`/${locale}/admin/audit` as `/${string}`}
          className="text-xs text-text-muted hover:text-text-strong"
        >
          {t('viewAll')}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{t('noAudit')}</p>
      ) : (
        <ul className="divide-y divide-text-subtle/20">
          {items.map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{e.action}</Badge>
                <span className="font-mono text-text-muted">{e.resourceId.slice(0, 8)}</span>
              </span>
              <span className="text-text-muted num-tab">
                {new Date(e.createdAtMs).toLocaleTimeString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
