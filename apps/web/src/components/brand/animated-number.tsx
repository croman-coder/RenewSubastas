'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  /** Format the (possibly fractional, mid-tween) number for display. */
  format?: (n: number) => string;
  className?: string;
  /** Tween duration in ms. */
  duration?: number;
}

/**
 * Count-up number with a brief motion blur while it travels, settling crisp
 * on the final value. On mount it shows the value immediately; only later
 * changes animate. Honors prefers-reduced-motion (snaps, no blur).
 */
export function AnimatedNumber({ value, format, className, duration = 650 }: Props) {
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('es-PY'));
  const [display, setDisplay] = useState(value);
  const [moving, setMoving] = useState(false);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value === from.current) {
      from.current = value;
      setDisplay(value);
      return;
    }
    cancelAnimationFrame(raf.current);
    const begin = from.current;
    const delta = value - begin;
    let startTs = 0;
    setMoving(true);
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setDisplay(begin + delta * eased);
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        from.current = value;
        setMoving(false);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return (
    <span
      className={cn(
        'num-tab inline-block transition-[filter,opacity] duration-200 ease-out',
        moving ? 'blur-[1.6px] opacity-90' : 'blur-0 opacity-100',
        className,
      )}
    >
      {fmt(display)}
    </span>
  );
}
