'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fades + lifts the wrapped block when it scrolls into view. Runs once
 * per element (no re-fire on scroll back up) so the page feels stable
 * after the first pass. Honors prefers-reduced-motion by skipping the
 * transform/opacity entirely — content paints immediately.
 *
 * Use it sparingly. Wrapping every paragraph turns a clean page into a
 * jittery one; reserve it for top-level sections (hero, KPI strip,
 * chart panels) so the eye gets a single rhythmic reveal per scroll.
 */
export function RevealOnScroll({
  children,
  className,
  delayMs = 0,
  // Pixels of vertical offset to lift from. Default 14px is a quiet
  // shift that signals "new content" without being distracting.
  offset = 14,
  // Fraction of the element that must be visible before triggering.
  // 0.15 = the panel starts revealing as soon as its top 15% enters.
  threshold = 0.15,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  offset?: number;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShown(true);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : `translateY(${offset}px)`,
        transition: `opacity 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`,
        willChange: shown ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
