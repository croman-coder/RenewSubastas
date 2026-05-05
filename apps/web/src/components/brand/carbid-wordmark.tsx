import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const sizeMap = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
  xl: 'text-7xl',
  '2xl': 'text-8xl',
};

export function CarbidWordmark({ className, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'font-wordmark font-bold leading-none tracking-tight inline-flex items-baseline',
        sizeMap[size],
        className,
      )}
      aria-label="CARBID"
    >
      <span className="text-copper">CAR</span>
      <span className="text-ink">BID</span>
    </span>
  );
}
