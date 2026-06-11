import { cn } from '@/lib/utils';

interface Props {
  /** Series of values, oldest -> newest. */
  data: number[];
  className?: string;
  /** Render as filled area under the line. */
  area?: boolean;
}

/**
 * Tiny monochrome sparkline (pure SVG, no chart lib). Draws the series as a
 * line that scales to the viewbox; inherits color via currentColor so it
 * adapts to the surrounding ink/muted tone. Renders nothing for <2 points.
 */
export function SparkLine({ data, className, area = true }: Props) {
  if (!data || data.length < 2) return null;

  const W = 100;
  const H = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = W / (data.length - 1);

  const pts = data.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / span) * (H - 4) - 2; // 2px padding top/bottom
    return [x, y] as const;
  });

  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const fill = `${line} L${W},${H} L0,${H} Z`;
  const gid = `spark-${data.length}-${Math.round(max)}-${Math.round(min)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-7 w-full text-text-strong/70', className)}
      aria-hidden
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gid})`} stroke="none" />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
