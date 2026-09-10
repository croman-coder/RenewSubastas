import Link from 'next/link';
import { ArrowDown, ArrowUp, CalendarRange, Minus, TriangleAlert } from 'lucide-react';
import type { PeriodComparison, PeriodDailyRow } from '@/lib/insights/load-period-comparison';
import {
  buildComparisonRows,
  comparisonGroups,
  lengthsDiffer,
  perDay,
  PRESET_KEYS,
  PRESET_LABEL,
  type ComparisonRow,
  type DateRange,
  type PresetKey,
  type PeriodTotals,
} from '@/lib/insights/period-compare';

interface Props {
  locale: string;
  comparison: PeriodComparison;
  /** The preset currently in effect, or `null` when the ranges are custom. */
  preset: PresetKey | null;
}

const num = (n: number) => n.toLocaleString('es-PY');

/** `2026-09-09` -> `09/09`. Day and month only: every range shown here is
 *  bounded by the header, so the year would be noise in every cell. */
function fmtDay(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

function fmtRange(range: DateRange): string {
  return `${fmtDay(range.from)} – ${fmtDay(range.to)}`;
}

function diasLabel(n: number): string {
  return `${n} día${n === 1 ? '' : 's'}`;
}

/**
 * The signed delta, coloured and arrowed.
 *
 * Every metric on this report is "more is better" (visits, sessions,
 * signups, each traffic source, each funnel step), so up is always green —
 * there is no metric here where a rise would be bad news.
 */
function Delta({ abs, pct }: { abs: number; pct: number | null }) {
  if (abs === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-text-muted num-tab">
        <Minus className="w-3 h-3" aria-hidden />
        igual
      </span>
    );
  }
  const up = abs > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={
        'inline-flex items-center gap-1 font-medium num-tab ' +
        (up ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')
      }
    >
      <Icon className="w-3 h-3" aria-hidden />
      {up ? '+' : ''}
      {num(abs)}
      {/* No base to divide by (period B had none of this metric). Saying
          "+100%" or "0%" there would invent a number the data can't support,
          so the absolute change stands alone. */}
      <span className="text-[11px] opacity-80">
        {pct === null ? '(sin base)' : `(${up ? '+' : ''}${pct}%)`}
      </span>
    </span>
  );
}

/** Headline card for the three metrics Lujan asked for by name. */
function HeadlineCard({ row, days }: { row: ComparisonRow; days: { a: number; b: number } }) {
  return (
    <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
        {row.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-text-strong num-tab">
        {num(row.a)}
      </p>
      <p className="mt-1 text-xs">
        <Delta abs={row.deltaAbs} pct={row.deltaPct} />
      </p>
      <p className="mt-1.5 text-[11px] text-text-muted num-tab">
        Antes: {num(row.b)} · {perDay(row.a, days.a)}/día vs {perDay(row.b, days.b)}/día
      </p>
    </div>
  );
}

/**
 * Period-vs-period comparison for `/staff/insights` — the report Lujan asked
 * for: sessions, visits and new users over an arbitrary date range, measured
 * against another range, with the day-by-day register underneath.
 *
 * Server component with a plain `method="get"` form and `<Link>` presets:
 * the whole control is a URL, so it costs no client JavaScript, survives a
 * refresh, and can be pasted into WhatsApp exactly as it was read.
 *
 * The two datasets behind it have different coverage and are never blended:
 * traffic exists only from the day the counter was deployed and only for
 * days the 09:30 rollup has closed, while signups go back to the first
 * account ever created. Where a requested day has no traffic aggregate the
 * register shows "—", never 0, and the coverage note above the table says
 * how many days the traffic figures actually cover. See
 * `load-period-comparison.ts`.
 */
export function PeriodComparator({ locale, comparison, preset }: Props) {
  const { a, b, earliestTrafficDate } = comparison;
  const rows = buildComparisonRows(a.totals, b.totals);
  const byKey = (key: string) => rows.find((r) => r.key === key)!;
  const days = { a: a.totals.days, b: b.totals.days };
  const basePath = `/${locale}/staff/insights`;
  const unequal = lengthsDiffer(a.totals, b.totals);
  const gaps = coverageGaps(a.totals, b.totals, earliestTrafficDate);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-strong tracking-tight">Comparar períodos</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Elegí dos rangos de fechas y mirá cómo se movió cada métrica de uno al otro.
        </p>
      </div>

      {/* ---- Range picker: presets as links, custom range as a GET form ---- */}
      <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium mr-1">
            <CalendarRange className="w-3.5 h-3.5" aria-hidden />
            Atajos
          </span>
          {PRESET_KEYS.map((key) => (
            <Link
              key={key}
              href={`${basePath}?p=${key}` as `/${string}`}
              className={
                'rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-colors ' +
                (preset === key
                  ? 'bg-text-strong text-bg-base ring-text-strong'
                  : 'text-text-muted ring-text-subtle/25 hover:text-text-strong hover:ring-text-subtle/50')
              }
            >
              {PRESET_LABEL[key]}
            </Link>
          ))}
        </div>

        {/* Plain GET form: submitting navigates to the same page with the
            four dates in the query string. No client component, no state. */}
        <form action={basePath} method="get" className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <RangeFields
            legend="Período A (actual)"
            fromName="af"
            toName="at"
            range={a.totals.range}
          />
          <RangeFields
            legend="Período B (comparación)"
            fromName="bf"
            toName="bt"
            range={b.totals.range}
          />
          <button
            type="submit"
            className="rounded-md bg-text-strong px-3 py-1.5 text-xs font-semibold text-bg-base hover:opacity-90 transition-opacity"
          >
            Comparar
          </button>
        </form>
      </div>

      {/* ---- Honesty notes: only rendered when they actually apply ---- */}
      {(unequal || gaps.length > 0) && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 space-y-1.5">
          {unequal && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-200">
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              <span>
                Los dos períodos no duran lo mismo ({diasLabel(days.a)} vs {diasLabel(days.b)}
                ). Compará el promedio por día, no los totales — de lo contrario el período más
                largo gana siempre.
              </span>
            </p>
          )}
          {gaps.map((g) => (
            <p
              key={g}
              className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-200"
            >
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              <span>{g}</span>
            </p>
          ))}
        </div>
      )}

      {/* ---- The three headline metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HeadlineCard row={byKey('views')} days={days} />
        <HeadlineCard row={byKey('sessions')} days={days} />
        <HeadlineCard row={byKey('newUsers')} days={days} />
      </div>

      {/* ---- Full table ---- */}
      <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <caption className="sr-only">
            Comparación de {fmtRange(a.totals.range)} contra {fmtRange(b.totals.range)}
          </caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
              <th scope="col" className="text-left font-medium px-4 py-2.5">
                Métrica
              </th>
              <th scope="col" className="text-right font-medium px-3 py-2.5">
                A · {fmtRange(a.totals.range)}
              </th>
              <th scope="col" className="text-right font-medium px-3 py-2.5">
                B · {fmtRange(b.totals.range)}
              </th>
              <th scope="col" className="text-right font-medium px-4 py-2.5">
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisonGroups().map((group) => (
              <GroupRows
                key={group}
                group={group}
                rows={rows.filter((r) => r.group === group)}
                days={days}
                unequal={unequal}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Day-by-day register ---- */}
      <details className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-text-strong flex items-center justify-between gap-3">
          <span>Registro por fechas (día a día)</span>
          <span className="text-xs text-text-muted font-normal group-open:hidden">Ver</span>
          <span className="text-xs text-text-muted font-normal hidden group-open:inline">
            Ocultar
          </span>
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 px-4 pb-4">
          <DailyTable title={`Período A · ${fmtRange(a.totals.range)}`} rows={a.daily} />
          <DailyTable title={`Período B · ${fmtRange(b.totals.range)}`} rows={b.daily} />
        </div>
      </details>
    </section>
  );
}

/** Two date inputs for one period. Native `type="date"` — the browser gives
 *  a real picker in every target browser and submits the exact `YYYY-MM-DD`
 *  the loader expects, with no client JS and no date library. */
function RangeFields({
  legend,
  fromName,
  toName,
  range,
}: {
  legend: string;
  fromName: string;
  toName: string;
  range: DateRange;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
        {legend}
      </legend>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          name={fromName}
          defaultValue={range.from}
          aria-label={`${legend} — desde`}
          className="rounded-md border border-text-subtle/25 bg-bg-base px-2 py-1 text-xs text-text-strong num-tab"
        />
        <span className="text-xs text-text-muted">a</span>
        <input
          type="date"
          name={toName}
          defaultValue={range.to}
          aria-label={`${legend} — hasta`}
          className="rounded-md border border-text-subtle/25 bg-bg-base px-2 py-1 text-xs text-text-strong num-tab"
        />
      </div>
    </fieldset>
  );
}

function GroupRows({
  group,
  rows,
  days,
  unequal,
}: {
  group: string;
  rows: ComparisonRow[];
  days: { a: number; b: number };
  unequal: boolean;
}) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={4}
          className="text-left px-4 pt-4 pb-1 text-[11px] uppercase tracking-[0.08em] text-text-muted font-semibold"
        >
          {group}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.key} className="border-t border-text-subtle/10">
          <td className="px-4 py-2 text-text-strong">{r.label}</td>
          <td className="px-3 py-2 text-right num-tab text-text-strong">
            {num(r.a)}
            {/* Per-day averages appear only when the two windows differ in
                length — that's the case where the totals column alone
                misleads. Otherwise they'd be four columns of noise. */}
            {unequal && (
              <span className="block text-[11px] text-text-muted">{perDay(r.a, days.a)}/día</span>
            )}
          </td>
          <td className="px-3 py-2 text-right num-tab text-text-muted">
            {num(r.b)}
            {unequal && (
              <span className="block text-[11px] text-text-muted">{perDay(r.b, days.b)}/día</span>
            )}
          </td>
          <td className="px-4 py-2 text-right text-xs">
            <Delta abs={r.deltaAbs} pct={r.deltaPct} />
          </td>
        </tr>
      ))}
    </>
  );
}

function DailyTable({ title, rows }: { title: string; rows: PeriodDailyRow[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium mb-1.5">
        {title}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted">
            <th scope="col" className="text-left font-medium py-1">
              Fecha
            </th>
            <th scope="col" className="text-right font-medium py-1">
              Visitas
            </th>
            <th scope="col" className="text-right font-medium py-1">
              Sesiones
            </th>
            <th scope="col" className="text-right font-medium py-1">
              Nuevos
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date} className="border-t border-text-subtle/10">
              <td className="py-1 num-tab text-text-muted">{fmtDay(d.date)}</td>
              {/* "—" means the day was never rolled up (counter not deployed
                  yet, or the 09:30 job hasn't run). It is NOT zero traffic,
                  and the table must not let the two look alike. */}
              <td className="py-1 text-right num-tab text-text-strong">
                {d.views === null ? <span className="text-text-muted/60">—</span> : num(d.views)}
              </td>
              <td className="py-1 text-right num-tab text-text-strong">
                {d.sessions === null ? (
                  <span className="text-text-muted/60">—</span>
                ) : (
                  num(d.sessions)
                )}
              </td>
              <td className="py-1 text-right num-tab text-text-strong">{num(d.newUsers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Plain-Spanish warnings for the days a period asked for but traffic can't
 * answer for. Returns an empty array when both periods are fully covered, so
 * the note block disappears entirely rather than reassuring the reader every
 * time.
 */
function coverageGaps(
  a: PeriodTotals,
  b: PeriodTotals,
  earliestTrafficDate: string | null,
): string[] {
  const out: string[] = [];
  for (const [name, p] of [
    ['A', a],
    ['B', b],
  ] as const) {
    if (p.daysWithTraffic >= p.days) continue;
    const missing = p.days - p.daysWithTraffic;
    const before =
      earliestTrafficDate && p.range.from < earliestTrafficDate
        ? ` El contador de tráfico arrancó el ${fmtDay(earliestTrafficDate)}: antes de esa fecha no hay visitas registradas.`
        : ' Puede ser que el resumen diario de las 9:30 todavía no haya corrido para el último día.';
    out.push(
      `Período ${name}: hay tráfico de ${p.daysWithTraffic} de ${diasLabel(p.days)} (faltan ${missing}).${before} Los usuarios nuevos sí están completos — salen del registro de cuentas, no del contador.`,
    );
  }
  return out;
}
