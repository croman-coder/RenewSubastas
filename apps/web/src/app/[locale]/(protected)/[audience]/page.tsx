import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Flame,
  Gavel,
  Heart,
  Hourglass,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadBuyerStats } from '@/lib/buyer/load-buyer-stats';
import { TodayLabel } from '@/components/shell/today-label';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { locale: string; audience: 'retail' | 'wholesale' };
}

export default async function BuyerHome({ params: { locale, audience } }: PageProps) {
  // The audience is taken from the URL segment, validated by the layout
  // (any other value falls through to notFound). Stats and links are scoped
  // to that audience so the dashboard reflects exactly what the URL claims.
  const user = await getCurrentUser(locale);
  const s = await loadBuyerStats(user.uid, audience);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-gradient-to-br from-bg-elev/60 via-bg-elev/30 to-transparent px-5 py-5 sm:px-6 sm:py-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div
          aria-hidden
          className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-text-strong/10 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-copper/5 blur-3xl pointer-events-none"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
              <TodayLabel locale={locale} />
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
              ¡Hola, {user.firstName || 'Buyer'}!
            </h1>
            <p className="mt-1 text-sm text-text-muted max-w-prose">
              Tu resumen de subastas y pujas en Renew Subastas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/${locale}/auctions` as `/${string}`}>
                <Gavel className="w-4 h-4 mr-1.5" /> Ver subastas
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/${audience}/bids` as `/${string}`}>
                <Heart className="w-4 h-4 mr-1.5" /> Mis pujas
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Subastas activas"
          value={s.liveAuctions}
          caption="En curso ahora"
          icon={Gavel}
          accent="mint"
          index={0}
        />
        <Kpi
          label="Estoy ganando"
          value={s.myWinningCount}
          caption="Sos el mejor postor"
          icon={Trophy}
          accent="copper"
          index={1}
        />
        <Kpi
          label="Mis pujas"
          value={s.myActiveBidsCount}
          caption="Subastas en las que pujé"
          icon={Heart}
          accent="lavender"
          index={2}
        />
        <Kpi
          label="Ganadas"
          value={s.myWonCount}
          caption={
            s.myWonGmvUsd > 0
              ? `USD ${s.myWonGmvUsd.toLocaleString()} totales`
              : 'Aún no ganaste ninguna'
          }
          icon={Trophy}
          accent="amber"
          index={3}
        />
      </div>

      {/* Two-column section: My winning auctions + Closing soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="Estoy ganando ahora"
          icon={Trophy}
          accent="copper"
          ctaHref={`/${locale}/${audience}/bids`}
          ctaLabel="Ver mis pujas"
        >
          {s.myWinning.length === 0 ? (
            <EmptyRow text="Cuando seas el mejor postor de una subasta, aparecerá acá." />
          ) : (
            <ul className="space-y-1">
              {s.myWinning.map((a, i) => (
                <AuctionRow
                  key={a.auctionId}
                  href={`/${locale}/auctions/${a.auctionId}`}
                  thumbnail={a.thumbnailUrl}
                  title={`${a.make} ${a.model}`}
                  year={a.year}
                  primaryLine={`USD ${a.currentBid.toLocaleString()}`}
                  secondaryLine={`Cierra ${formatRemainingShort(a.endsAtMs - Date.now())}`}
                  highlight
                  index={i}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Cierran pronto"
          icon={Clock}
          accent="amber"
          ctaHref={`/${locale}/auctions?tab=closing`}
          ctaLabel="Ver todas"
        >
          {s.closingSoon.length === 0 ? (
            <EmptyRow text="Ninguna subasta cierra en las próximas 24 horas." />
          ) : (
            <ul className="space-y-1">
              {s.closingSoon.map((a, i) => {
                const remaining = a.endsAtMs - Date.now();
                const urgent = remaining > 0 && remaining < 60 * 60 * 1000;
                return (
                  <AuctionRow
                    key={a.id}
                    href={`/${locale}/auctions/${a.id}`}
                    thumbnail={a.thumbnailUrl}
                    title={`${a.make} ${a.model}`}
                    year={a.year}
                    primaryLine={`USD ${(a.currentBid > 0 ? a.currentBid : a.startingPrice).toLocaleString()}`}
                    secondaryLine={`Cierra ${formatRemainingShort(remaining)}`}
                    urgent={urgent}
                    index={i}
                  />
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Bottom row: Status counts + Favorites */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <StatusCard live={s.liveAuctions} scheduled={s.scheduledAuctions} ended={s.endedAuctions} />
        <Panel
          title="Mis favoritos en vivo"
          icon={Heart}
          accent="lavender"
          ctaHref={`/${locale}/auctions?tab=favorites`}
          ctaLabel="Ver favoritos"
        >
          <div className="px-3 pb-2">
            <div className="rounded-lg bg-bg-deep/40 px-4 py-5 text-center">
              <p className="text-3xl font-bold tracking-tight num-tab text-text-strong">
                {s.myFavoritesLiveCount}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {s.myFavoritesLiveCount === 1
                  ? 'subasta favorita activa'
                  : 'subastas favoritas activas'}
              </p>
            </div>
          </div>
        </Panel>
        <Panel
          title="Próximas a abrirse"
          icon={Hourglass}
          accent="amber"
          ctaHref={`/${locale}/auctions`}
          ctaLabel="Ver subastas"
        >
          <div className="px-3 pb-2">
            <div className="rounded-lg bg-bg-deep/40 px-4 py-5 text-center">
              <p className="text-3xl font-bold tracking-tight num-tab text-amber-300">
                {s.scheduledAuctions}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {s.scheduledAuctions === 1 ? 'subasta programada' : 'subastas programadas'}
              </p>
            </div>
          </div>
        </Panel>
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
    ring: 'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/60 before:to-text-strong/0',
    iconBg: 'bg-text-strong/10',
    iconText: 'text-text-strong',
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
  icon: LucideIcon;
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
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium truncate">
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
      {caption && (
        <p className="mt-3 text-xs text-text-muted truncate" title={caption}>
          {caption}
        </p>
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  accent,
  ctaHref,
  ctaLabel,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: Accent;
  ctaHref: string;
  ctaLabel: string;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in duration-500 flex flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={'w-7 h-7 rounded-md grid place-items-center ' + a.iconBg + ' ' + a.iconText}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">{title}</h2>
        </div>
      </header>
      <div className="px-3 pb-3 flex-1">{children}</div>
      <div className="px-5 py-3 border-t border-text-subtle/10">
        <Link
          href={ctaHref as `/${string}`}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-copper transition-colors"
        >
          {ctaLabel} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}

function AuctionRow({
  href,
  thumbnail,
  title,
  year,
  primaryLine,
  secondaryLine,
  highlight,
  urgent,
  index,
}: {
  href: string;
  thumbnail: string | null;
  title: string;
  year: number;
  primaryLine: string;
  secondaryLine: string;
  highlight?: boolean;
  urgent?: boolean;
  index: number;
}) {
  return (
    <li
      className="animate-in fade-in slide-in-from-bottom-1"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      <Link
        href={href as `/${string}`}
        className={
          'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-deep/50 group'
        }
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="w-12 h-12 rounded-md object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 rounded-md bg-bg-deep/60 shrink-0 grid place-items-center">
            <Gavel className="w-4 h-4 text-text-muted/40" strokeWidth={1.5} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-strong truncate group-hover:text-copper transition-colors">
            {title} <span className="text-text-muted num-tab font-normal">{year}</span>
          </p>
          <p
            className={
              'text-xs num-tab mt-0.5 flex items-center gap-1 ' +
              (urgent ? 'text-rose-400 font-medium' : 'text-text-muted')
            }
          >
            {urgent && <Flame className="w-3 h-3" />}
            {secondaryLine}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={
              'text-sm font-semibold num-tab tracking-tight ' +
              (highlight ? 'text-copper' : 'text-text-strong')
            }
          >
            {primaryLine}
          </p>
        </div>
      </Link>
    </li>
  );
}

function StatusCard({
  live,
  scheduled,
  ended,
}: {
  live: number;
  scheduled: number;
  ended: number;
}) {
  const total = live + scheduled + ended;
  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in duration-500">
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <span className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-300 grid place-items-center">
          <Gavel className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <h2 className="text-sm font-semibold text-text-strong tracking-tight">
          Estado del marketplace
        </h2>
      </header>
      <div className="px-5 pb-5 space-y-3">
        <StatusRow label="En curso" value={live} dot="bg-emerald-400" total={total} />
        <StatusRow label="Programadas" value={scheduled} dot="bg-amber-400" total={total} />
        <StatusRow label="Finalizadas" value={ended} dot="bg-zinc-500" total={total} />
      </div>
    </section>
  );
}

function StatusRow({
  label,
  value,
  dot,
  total,
}: {
  label: string;
  value: number;
  dot: string;
  total: number;
}) {
  const pct = total > 0 ? Math.max(2, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-2 text-text-muted">
          <span className={'w-1.5 h-1.5 rounded-full ' + dot} />
          {label}
        </span>
        <span className="text-text-strong font-medium num-tab">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-deep/60 overflow-hidden">
        <div
          className={'h-full rounded-full transition-all duration-500 ' + dot.replace('bg-', 'bg-')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-xs text-text-muted">{text}</p>
    </div>
  );
}

function formatRemainingShort(ms: number): string {
  if (ms <= 0) return 'pronto';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  if (days >= 1) return `en ${days} día${days === 1 ? '' : 's'}`;
  const hours = Math.floor(totalSec / 3600);
  if (hours >= 1) return `en ${hours}h`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes >= 1) return `en ${minutes}m`;
  return 'en segundos';
}
