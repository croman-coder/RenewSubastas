import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Activity,
  History,
  UserPlus,
  UserCog,
  UserMinus,
  KeyRound,
  LogOut,
  Gavel,
  XCircle,
  CheckCircle2,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface AuditItem {
  id: string;
  action: string;
  actorUid: string;
  resourceType: string;
  resourceId: string;
  createdAtMs: number;
}

interface Props {
  locale: string;
  items: AuditItem[];
}

interface Descriptor {
  icon: LucideIcon;
  /** Tailwind color classes for the icon tile and accent dot. */
  tone: { bg: string; text: string };
  /** Plain-Spanish title. The short id appears as a chip after the title. */
  title: string;
}

// Map technical action codes to human-readable copy. Keep the catalogue in
// sync with audit.ts emitters in functions/src so admins recognise every
// system event without having to read the source.
const DESCRIPTORS: Record<string, Descriptor> = {
  'user.create': {
    icon: UserPlus,
    tone: { bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
    title: 'Se creó un nuevo usuario',
  },
  'user.update_role': {
    icon: UserCog,
    tone: { bg: 'bg-text-strong/10', text: 'text-text-strong' },
    title: 'Se cambió el rol de un usuario',
  },
  'user.delete': {
    icon: UserMinus,
    tone: { bg: 'bg-rose-500/10', text: 'text-rose-300' },
    title: 'Se eliminó un usuario',
  },
  'user.password_reset_generated': {
    icon: KeyRound,
    tone: { bg: 'bg-amber-500/10', text: 'text-amber-300' },
    title: 'Se generó un link para restablecer contraseña',
  },
  'user.revoke_sessions': {
    icon: LogOut,
    tone: { bg: 'bg-zinc-500/15', text: 'text-zinc-300' },
    title: 'Se cerraron las sesiones de un usuario',
  },
  'auction.create': {
    icon: Gavel,
    tone: { bg: 'bg-copper/15', text: 'text-copper' },
    title: 'Se creó una nueva subasta',
  },
  'auction.cancel': {
    icon: XCircle,
    tone: { bg: 'bg-rose-500/10', text: 'text-rose-300' },
    title: 'Se canceló una subasta',
  },
  'auction.close': {
    icon: CheckCircle2,
    tone: { bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
    title: 'Se finalizó una subasta',
  },
  'app_config.update': {
    icon: Settings,
    tone: { bg: 'bg-amber-500/10', text: 'text-amber-300' },
    title: 'Se actualizó la configuración global',
  },
};

const FALLBACK: Descriptor = {
  icon: Activity,
  tone: { bg: 'bg-zinc-500/15', text: 'text-zinc-300' },
  title: 'Actividad del sistema',
};

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
          <span className="w-7 h-7 rounded-md bg-text-strong/10 text-text-strong grid place-items-center">
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
        <ul className="px-3 pb-3 space-y-0.5">
          {items.map((e, idx) => {
            const d = DESCRIPTORS[e.action] ?? FALLBACK;
            const Icon = d.icon;
            return (
              <li
                key={e.id}
                className={
                  'flex items-start gap-3 rounded-lg px-3 py-2.5 ' +
                  'transition-colors hover:bg-bg-deep/60 ' +
                  'animate-in fade-in slide-in-from-bottom-1'
                }
                style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'both' }}
              >
                <span
                  className={
                    'shrink-0 w-8 h-8 rounded-md grid place-items-center mt-0.5 ' +
                    d.tone.bg +
                    ' ' +
                    d.tone.text
                  }
                >
                  <Icon className="w-4 h-4" strokeWidth={2.25} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-strong leading-tight">{d.title}</p>
                  <p className="text-[11px] text-text-muted mt-0.5 num-tab">
                    {formatStamp(e.createdAtMs, locale)} ·{' '}
                    <span className="font-mono">{e.resourceId.slice(0, 8)}</span>
                  </p>
                </div>
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

function formatStamp(ts: number, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
