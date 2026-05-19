import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Pixel size of the square. Defaults to 40. */
  size?: number;
  /** Show the subtle ring around the mark. */
  ring?: boolean;
}

/**
 * Compact square Renew monogram. Renders the official lowercase "rs" mark
 * (public/brand/rs-lowercase-1024.png) as a CSS mask cutout over a solid
 * ink chip, so the mark colour picks up `bg-base` (white in light theme,
 * near-black in dark theme) automatically — no inverted asset variants
 * needed.
 *
 * Used as avatar / list-item thumbnail in spots where the full wordmark is
 * too wide (notification rows, audit authors).
 */
export function RenewMark({ className, size = 40, ring = true }: Props) {
  const maskUrl = "url('/brand/rs-lowercase-1024.png')";
  return (
    <span
      role="img"
      aria-label="Renew Subastas"
      className={cn(
        'inline-grid place-items-center select-none rounded-xl bg-ink relative overflow-hidden',
        ring && 'ring-1 ring-text-strong/20',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="block bg-bg-base"
        style={{
          width: '64%',
          height: '64%',
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
    </span>
  );
}
