import Link from 'next/link';
import {
  Plus,
  Car,
  Gavel,
  FileEdit,
  CheckCircle2,
  Hourglass,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadStaffStats } from '@/lib/staff/load-staff-stats';
import { formatLongDatePy } from '@/lib/format/date';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { locale: string };
}

export default async function StaffHome({ params: { locale } }: PageProps) {
  const user = await getCurrentUser(locale);
  const s = await loadStaffStats(user.uid);

  const totalVehicles =
    s.vehicles.draft + s.vehicles.ready + s.vehicles.inAuction + s.vehicles.sold;
  const totalAuctions = s.auctions.scheduled + s.auctions.live + s.auctions.ended;

  const dateStr = formatLongDatePy(locale);

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-5 py-5 sm:px-6 sm:py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div
          aria-hidden
          className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-copper/5 blur-3xl pointer-events-none"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
              {dateStr}
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
              Mi panel
            </h1>
            <p className="mt-1 text-sm text-text-muted max-w-prose">
              Resumen de tus vehículos y subastas en CARBID.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/${locale}/staff/vehicles/new` as `/${string}`}>
                <Plus className="w-4 h-4 mr-1.5" /> Vehículo
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/staff/auctions/new` as `/${string}`}>
                <Plus className="w-4 h-4 mr-1.5" /> Subasta
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Borrador"
          value={s.vehicles.draft}
          icon={FileEdit}
          accent="lavender"
          caption="Sin completar"
          index={0}
        />
        <Kpi
          label="Listos"
          value={s.vehicles.ready}
          icon={CheckCircle2}
          accent="mint"
          caption="Listos para subastar"
          index={1}
        />
        <Kpi
          label="En subasta"
          value={s.vehicles.inAuction}
          icon={Hourglass}
          accent="amber"
          caption="Subasta activa"
          index={2}
        />
        <Kpi
          label="Vendidos"
          value={s.vehicles.sold}
          icon={Trophy}
          accent="copper"
          caption="Histórico"
          index={3}
        />
      </div>

      {/* Two summary panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SummaryPanel
          title="Mis vehículos"
          total={totalVehicles}
          icon={Car}
          accent="lavender"
          rows={[
            { label: 'Borrador', value: s.vehicles.draft },
            { label: 'Listos', value: s.vehicles.ready },
            { label: 'En subasta', value: s.vehicles.inAuction },
            { label: 'Vendidos', value: s.vehicles.sold },
          ]}
          ctaHref={`/${locale}/staff/vehicles`}
          ctaLabel="Ver todos"
        />
        <SummaryPanel
          title="Mis subastas"
          total={totalAuctions}
          icon={Gavel}
          accent="mint"
          rows={[
            { label: 'Programadas', value: s.auctions.scheduled },
            { label: 'En vivo', value: s.auctions.live },
            { label: 'Finalizadas', value: s.auctions.ended },
          ]}
          ctaHref={`/${locale}/staff/auctions`}
          ctaLabel="Ver todas"
        />
      </div>
    </div>
  );
}

type Accent = 'copper' | 'mint' | 'lavender' | 'amber';
const ACCENT: Record<Accent, { ring: string; iconBg: string; iconText: string }> = {
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

function Kpi({
  label,
  value,
  caption,
  icon: Icon,
  accent,
  index,
}: {
  label: string;
  value: number;
  caption?: string;
  icon: typeof Car;
  accent: Accent;
  index: number;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={
        'group relative overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-5 ' +
        'transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 ' +
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ' +
        'animate-in fade-in slide-in-from-bottom-2 ' +
        'before:absolute before:inset-x-0 before:top-0 before:h-px ' +
        a.ring
      }
      style={{ animationDelay: `${index * 70}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-text-strong num-tab">
            {value.toLocaleString()}
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
      {caption && <p className="mt-3 text-xs text-text-muted">{caption}</p>}
    </div>
  );
}

function SummaryPanel({
  title,
  total,
  icon: Icon,
  accent,
  rows,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  total: number;
  icon: typeof Car;
  accent: Accent;
  rows: Array<{ label: string; value: number }>;
  ctaHref: string;
  ctaLabel: string;
}) {
  const a = ACCENT[accent];
  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in duration-500">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={'w-7 h-7 rounded-md grid place-items-center ' + a.iconBg + ' ' + a.iconText}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">{title}</h2>
        </div>
        <span className="text-xs text-text-muted num-tab">
          Total <span className="text-text-strong font-semibold">{total}</span>
        </span>
      </header>
      <ul className="px-3 pb-3">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-bg-deep/60 transition-colors"
          >
            <span className="text-text-muted">{r.label}</span>
            <span className="text-text-strong font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 border-t border-text-subtle/10">
        <Link
          href={ctaHref as `/${string}`}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-copper transition-colors"
        >
          {ctaLabel}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}
