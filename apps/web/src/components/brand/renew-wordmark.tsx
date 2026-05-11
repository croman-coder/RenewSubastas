import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /**
   * Renders the "Subastas" lockup tag below the wordmark. Off by default so
   * the wordmark can sit alone in compact spaces (topbar, mobile sheet).
   */
  withLockup?: boolean;
}

const sizeMap = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
  xl: 'text-7xl',
  '2xl': 'text-8xl',
};

/**
 * Renew wordmark.
 *
 * Mirrors the supplied brand logo: outlined "re" (text-stroke trick) +
 * solid "new" in ink, all set in the display face. The two halves share
 * a single baseline so the visual rhythm matches the source mark.
 *
 * The outline trick uses `-webkit-text-stroke` for "re" and `text-transparent`
 * to clear the fill. We render a same-colored solid duplicate behind it on
 * older engines that don't support text-stroke, but `-webkit-text-stroke`
 * has shipped in every evergreen browser for years, so this is mostly a
 * defensive belt-and-suspenders.
 */
export function RenewWordmark({ className, size = 'md', withLockup = false }: Props) {
  return (
    <span
      className={cn('inline-flex flex-col leading-none select-none', className)}
      aria-label="Renew Subastas"
    >
      <span
        className={cn(
          'font-display font-bold tracking-tight inline-flex items-baseline lowercase',
          sizeMap[size],
        )}
      >
        <span
          aria-hidden
          className="text-transparent"
          style={{ WebkitTextStroke: '1.5px currentColor' }}
        >
          re
        </span>
        <span className="text-ink">new</span>
      </span>
      {withLockup && (
        <span className="mt-1.5 text-[10px] uppercase tracking-[0.32em] text-text-muted font-medium">
          Subastas
        </span>
      )}
    </span>
  );
}
