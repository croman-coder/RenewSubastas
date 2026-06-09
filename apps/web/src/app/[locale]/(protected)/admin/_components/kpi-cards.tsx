import { useTranslations } from 'next-intl';
import { Users, Gavel, DollarSign, TrendingUp, type LucideIcon } from 'lucide-react';
import { BlurNumber } from '@/components/brand/blur-number';

interface Props {
  usersTotal: number;
  liveAuctions: number;
  gmvUsd: number;
  bidsToday: number;
}

interface KpiItem {
  label: string;
  value: number;
  prefix?: string;
  icon: LucideIcon;
  accent: 'copper' | 'mint' | 'lavender' | 'amber';
  caption?: string;
}

export function KpiCards({ usersTotal, liveAuctions, gmvUsd, bidsToday }: Props) {
  const t = useTranslations('admin.home.kpis');
  const items: KpiItem[] = [
    {
      label: t('activeUsers'),
      value: usersTotal,
      icon: Users,
      accent: 'lavender',
      caption: 'Total con sesión activa',
    },
    {
      label: t('liveAuctions'),
      value: liveAuctions,
      icon: Gavel,
      accent: 'mint',
      caption: 'Subastas en curso',
    },
    {
      label: t('gmv'),
      value: gmvUsd,
      prefix: 'USD ',
      icon: DollarSign,
      accent: 'copper',
      caption: 'Valor bruto vendido',
    },
    {
      label: t('bidsToday'),
      value: bidsToday,
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

// All four KPI accents collapse to monochrome ink tiers so the cards
// look like one cohesive set instead of a rainbow. Hierarchy comes from
// tonal weight (solid ink chip vs ringed light chip), not chromatic
// difference, which keeps the dashboard on-brand and lifts perceived
// quality. Ring gradient kept on every variant for the top-edge accent
// line that gives the cards their "premium" feel.
const ACCENT_STYLES: Record<KpiItem['accent'], { ring: string; iconBg: string; iconText: string }> =
  {
    copper: {
      ring: 'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/80 before:to-text-strong/0',
      iconBg: 'bg-text-strong',
      iconText: 'text-bg-base',
    },
    mint: {
      ring: 'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/55 before:to-text-strong/0',
      iconBg: 'bg-text-strong/[0.08] ring-1 ring-text-subtle/25',
      iconText: 'text-text-strong',
    },
    lavender: {
      ring: 'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/55 before:to-text-strong/0',
      iconBg: 'bg-text-strong/[0.08] ring-1 ring-text-subtle/25',
      iconText: 'text-text-strong',
    },
    amber: {
      ring: 'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/55 before:to-text-strong/0',
      iconBg: 'bg-text-strong/[0.08] ring-1 ring-text-subtle/25',
      iconText: 'text-text-strong',
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
            {item.prefix}
            <BlurNumber
              value={item.value}
              animateOnMount
              duration={1.1}
              format={(n) => Math.round(n).toLocaleString('es-PY')}
            />
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
