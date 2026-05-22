import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /**
   * Renders the "Subastas" lockup tag below the wordmark. Off by default
   * so the wordmark can sit alone in compact spaces (topbar, mobile
   * sheet).
   */
  withLockup?: boolean;
}

// Heights (rem) chosen to match the visual weight the old text-based
// wordmark hit at each step. The PNG is 1080×385 (~2.8:1) so width is
// computed from the aspect ratio — the component never stretches the
// glyph.
const heightMap = {
  sm: 'h-6', // 24px
  md: 'h-9', // 36px
  lg: 'h-14', // 56px
  xl: 'h-20', // 80px
  '2xl': 'h-28', // 112px
};

const LOGO_ASPECT = 1080 / 385;

/**
 * Renew Subastas wordmark.
 *
 * Renders the official PNG via a CSS mask cutout so the mark colour
 * always picks up `currentColor`. That lets us swap between the white-
 * on-dark and black-on-light contexts without shipping two assets per
 * surface or doing `dark:` swaps — the parent's text colour drives the
 * fill, and `text-ink` resolves to black in light theme / white in dark
 * theme via the token system.
 *
 * We use the white-variant PNG as the mask because its silhouette is
 * the fullest (the black variant has the same shape but slightly
 * thicker strokes where ink trapping was applied for print).
 */
export function RenewWordmark({ className, size = 'md', withLockup = false }: Props) {
  const maskUrl = "url('/brand/renew-wordmark-white.png')";
  return (
    <span
      className={cn('inline-flex flex-col leading-none select-none', className)}
      aria-label="Renew Subastas"
      role="img"
    >
      <span
        aria-hidden
        className={cn('block bg-ink', heightMap[size])}
        style={{
          aspectRatio: `${LOGO_ASPECT}`,
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'left center',
          maskPosition: 'left center',
        }}
      />
      {withLockup && (
        <span className="mt-2 text-[10px] uppercase tracking-[0.32em] text-text-muted font-medium">
          Subastas
        </span>
      )}
    </span>
  );
}
