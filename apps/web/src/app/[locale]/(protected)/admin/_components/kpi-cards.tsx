import { useTranslations } from 'next-intl';
import { Users, Gavel, DollarSign, TrendingUp, type LucideIcon } from 'lucide-react';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
}

interface KpiItem {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: 'copper' | 'mint' | 'lavender' | 'amber';
  caption?: string;
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday }: Props) {
  const t = useTranslations('admin.home.kpis');
  const items: KpiItem[] = [
    {
      label: t('activeUsers'),
      value: usersTotal.toLocaleString(),
      icon: Users,
      accent: 'lavender',
      caption: 'Total con sesión activa',
    },
    {
      label: t('liveAuctions'),
      value: liveAuctions.toLocaleString(),
      icon: Gavel,
      accent: 'mint',
      caption: 'Subastas en curso',
    },
    {
      label: t('gmv'),
      value: gmvUsd.toLocaleString(),
      icon: DollarSign,
      accent: 'copper',
      caption: 'Valor bruto vendido',
    },
    {
      label: t('bidsToday'),
      value: bidsToday.toLocaleString(),
      icon: TrendingUp,
      accent: 'amber',
      caption: 'Pujas en las últimas 24h',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, idx) => (
        <KpiCard key={it.label} item={it} index={idx} />
      ))}
    </div>
  );
}

const ACCENT_STYLES: Record<KpiItem['accent'], { ring: string; iconBg: string; iconText: string }> =
  {
    copper: {
      ring: 'before:bg-gradient-to-r before:from-copper/0 before:via-copper/70 before:to-copper/0',
      iconBg: 'bg-copper/10',
      iconText: 'text-copper',
    },
    mint: {
      ring: 'before:bg-gradient-to-r before:from-emerald-400/0 before:via-emerald-400/60 before:to-emerald-400/0',
      iconBg: 'bg-emerald-500/10',
      iconText: 'text-emerald-400',
    },
    lavender: {
      ring: 'before:bg-gradient-to-r before:from-violet-400/0 before:via-violet-400/60 before:to-violet-400/0',
      iconBg: 'bg-violet-500/10',
      iconText: 'text-violet-300',
    },
    amber: {
      ring: 'before:bg-gradient-to-r before:from-amber-400/0 before:via-amber-400/60 before:to-amber-400/0',
      iconBg: 'bg-amber-500/10',
      iconText: 'text-amber-300',
    },
  };

function KpiCard({ item, index }: { item: KpiItem; index: number }) {
  const Icon = item.icon;
  const a = ACCENT_STYLES[item.accent];
  return (
    <div
      className={
        'group relative overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-5 ' +
        'transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 ' +
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ' +
        'animate-in fade-in slide-in-from-bottom-2 ' +
        // Top hairline accent
        'before:absolute before:inset-x-0 before:top-0 before:h-px ' +
        a.ring
      }
      style={{ animationDelay: `${index * 70}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
            {item.label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-text-strong num-tab">
            {item.value}
          </p>
        </div>
        <div
          className={
            'shrink-0 w-10 h-10 rounded-lg grid place-items-center ' +
            'transition-transform duration-300 group-hover:scale-110 ' +
            a.iconBg +
            ' ' +
            a.iconText
          }
        >
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </div>
      </div>
      {item.caption && <p className="mt-3 text-xs text-text-muted">{item.caption}</p>}
    </div>
  );
}
