import { type LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Tailwind tint pair for the icon tile (bg + text). Defaults to copper. */
  accent?: 'copper' | 'mint' | 'lavender' | 'amber';
  children: React.ReactNode;
}

const ACCENT_TILE: Record<NonNullable<Props['accent']>, string> = {
  copper: 'bg-copper/10 text-copper',
  mint: 'bg-emerald-500/10 text-emerald-300',
  lavender: 'bg-text-strong/10 text-text-strong',
  amber: 'bg-amber-500/10 text-amber-300',
};

/**
 * Card wrapper for a logical group of form fields. Mirrors the dashboard
 * section style so forms read as composed of named blocks (Identificación,
 * Especificaciones, Descripción, etc.) instead of a long flat scroll.
 *
 * The icon + title + description live in a sticky-feeling header, then the
 * children render in a padded body. Pure layout — fields style themselves.
 */
export function FormSection({
  icon: Icon,
  title,
  description,
  accent = 'copper',
  children,
}: Props) {
  return (
    <section className="rounded-2xl border border-text-subtle/15 bg-bg-elev/40 transition-colors hover:bg-bg-elev/55">
      <header className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4">
        <span
          aria-hidden
          className={
            'shrink-0 w-9 h-9 rounded-lg grid place-items-center mt-0.5 ' + ACCENT_TILE[accent]
          }
        >
          <Icon className="w-4 h-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-text-strong">{title}</h2>
          {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
        </div>
      </header>
      <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Standardised wrapper for a label + input pair. Provides the eyebrow-style
 * label and consistent error placement so every form field reads the same.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted"
      >
        {label}
        {required && <span className="text-copper ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
