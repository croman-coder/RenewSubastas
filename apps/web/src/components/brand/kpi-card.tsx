'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { BlurNumber } from '@/components/brand/blur-number';
import { SparkLine } from '@/components/brand/spark-line';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: number;
  /** Rendered icon node (e.g. <Gavel className="w-5 h-5" />). Pass a rendered
   *  element, not a component, so it serializes across the RSC boundary when a
   *  server component renders this client card. */
  icon: ReactNode;
  /** Prefix before the number, e.g. "USD ". */
  prefix?: string;
  caption?: string;
  /** Optional real series for a sparkline footer. Omit when no data. */
  spark?: number[];
  /** `solid` ink-fills the icon chip (use for the primary KPI). */
  emphasis?: 'solid' | 'soft';
  /** When set, the whole card becomes a link to this route. */
  href?: string;
  index?: number;
  className?: string;
}

/**
 * Dashboard KPI card, CoreUI-inspired but monochrome glass. Frosted surface,
 * big count-up number (BlurNumber), icon chip, optional caption, and an
 * optional sparkline footer when a real series is provided. Shared across
 * admin / staff / buyer dashboards so every role gets the same treatment.
 */
export function KpiCard({
  label,
  value,
  icon,
  prefix,
  caption,
  spark,
  emphasis = 'soft',
  href,
  index = 0,
  className,
}: Props) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-text-strong num-tab">
            {prefix}
            <BlurNumber
              value={value}
              animateOnMount
              duration={1.1}
              format={(n) => Math.round(n).toLocaleString('es-PY')}
            />
          </p>
        </div>
        <div
          className={cn(
            'shrink-0 w-10 h-10 rounded-lg grid place-items-center transition-transform duration-300 group-hover:scale-110',
            emphasis === 'solid'
              ? 'bg-text-strong text-bg-base'
              : 'bg-text-strong/[0.08] ring-1 ring-text-subtle/25 text-text-strong',
          )}
        >
          {icon}
        </div>
      </div>

      {spark && spark.length >= 2 ? (
        <div className="mt-3 -mx-1">
          <SparkLine data={spark} />
        </div>
      ) : (
        caption && <p className="mt-3 text-xs text-text-muted">{caption}</p>
      )}

      {href && (
        <span
          aria-hidden
          className="absolute right-4 top-4 text-text-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <ArrowUpRight className="w-4 h-4" strokeWidth={2.25} />
        </span>
      )}
    </>
  );

  const base = cn(
    'glass-surface group relative overflow-hidden rounded-xl p-5',
    'transition-all duration-300 hover:-translate-y-0.5',
    'hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.55)]',
    'animate-in fade-in slide-in-from-bottom-2',
    'before:absolute before:inset-x-0 before:top-0 before:h-px',
    'before:bg-gradient-to-r before:from-text-strong/0 before:via-text-strong/40 before:to-text-strong/0',
    className,
  );
  const style = { animationDelay: `${index * 70}ms`, animationFillMode: 'both' as const };

  if (href) {
    return (
      <Link href={href as `/${string}`} className={cn(base, 'block')} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={base} style={style}>
      {inner}
    </div>
  );
}
