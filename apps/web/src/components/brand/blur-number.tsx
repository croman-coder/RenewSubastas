'use client';

import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  /** Format the (mid-tween) number for display. */
  format?: (n: number) => string;
  className?: string;
  /** Tween duration in seconds. */
  duration?: number;
  /** Count up from 0 to value once on mount (for dashboard KPIs). */
  animateOnMount?: boolean;
}

/**
 * Animated Blur Number (21st.dev pattern, built on `motion`). Counts up to the
 * new value on an ease-out curve while a brief motion blur smears the digits,
 * settling crisp. On mount it shows the value instantly; only later changes
 * animate. Monochrome: inherits text color. Honors prefers-reduced-motion.
 */
export function BlurNumber({
  value,
  format,
  className,
  duration = 0.7,
  animateOnMount = false,
}: Props) {
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('es-PY'));
  const mv = useMotionValue(animateOnMount ? 0 : value);
  const text = useTransform(mv, (n) => fmt(n));
  const [blur, setBlur] = useState(false);
  const prev = useRef(animateOnMount ? 0 : value);

  useEffect(() => {
    if (value === prev.current) return;
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      mv.set(value);
      prev.current = value;
      return;
    }
    prev.current = value;
    setBlur(true);
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setBlur(false),
    });
    return () => controls.stop();
  }, [value, duration, mv]);

  return (
    <motion.span
      className={cn(
        'num-tab inline-block transition-[filter,opacity] duration-200 ease-out',
        blur ? 'blur-[2px] opacity-90' : 'blur-0 opacity-100',
        className,
      )}
    >
      {text}
    </motion.span>
  );
}
