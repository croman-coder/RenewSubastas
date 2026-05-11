import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Pixel size of the square. Defaults to 40. */
  size?: number;
  /** Show the subtle ring around the mark. */
  ring?: boolean;
}

/**
 * Compact square Renew monogram. Used as avatar / list-item thumbnail in
 * spots where the full wordmark is too wide (notification rows, audit
 * authors, etc.). Reads "R" on a high-contrast ink chip.
 */
export function RenewMark({ className, size = 40, ring = true }: Props) {
  return (
    <span
      role="img"
      aria-label="Renew Subastas"
      className={cn(
        'inline-grid place-items-center font-display font-bold leading-none select-none',
        'rounded-xl bg-ink text-bg-base tracking-tight relative overflow-hidden',
        ring && 'ring-1 ring-text-strong/20',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span className="relative lowercase">r</span>
    </span>
  );
}
