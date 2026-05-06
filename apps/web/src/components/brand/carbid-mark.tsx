import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Pixel size of the square. Defaults to 40. */
  size?: number;
  /** Show the gradient ring around the mark. */
  ring?: boolean;
}

/**
 * Compact square CARBID monogram, intended for use as an avatar / list-item
 * thumbnail in places where the full wordmark would be too wide
 * (e.g. notifications, comment authors, audit log rows).
 *
 * Reads "CB" — a stylized initialism of CAR + BID — over a copper-tinted
 * gradient with a subtle ring, mirroring the wordmark's color story.
 */
export function CarbidMark({ className, size = 40, ring = true }: Props) {
  return (
    <span
      role="img"
      aria-label="CARBID"
      className={cn(
        'inline-grid place-items-center font-wordmark font-bold leading-none select-none',
        'rounded-xl bg-gradient-to-br from-copper/35 via-copper/15 to-ink/30',
        'text-text-strong tracking-tight relative overflow-hidden',
        ring && 'ring-1 ring-copper/30',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(205,155,79,0.35),transparent_60%)]"
      />
      <span className="relative inline-flex items-baseline">
        <span className="text-copper">C</span>
        <span className="text-text-strong">B</span>
      </span>
    </span>
  );
}
