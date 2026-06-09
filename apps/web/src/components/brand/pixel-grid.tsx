'use client';

import { useEffect, useRef } from 'react';

/**
 * Animated monochrome dot-matrix backdrop. A single <canvas> draws a grid of
 * dots with a slow diagonal shimmer wave plus occasional twinkles, in the
 * brand ink (dark dots on light theme, white dots on dark theme). Purely
 * decorative: pointer-events none, aria-hidden, and it freezes to a static
 * field when the user prefers reduced motion.
 */
export function PixelGrid({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);

    const GAP = 26; // px between dots
    const R = 1.15; // dot radius

    // Achromatic palette: read --text-strong lightness to decide whether the
    // dots should be near-black (light theme) or white (dark theme).
    const lch = getComputedStyle(document.documentElement).getPropertyValue('--text-strong').trim();
    const L = parseFloat(lch) || 0.1;
    const rgb = L > 0.5 ? '255,255,255' : '10,10,10';

    let w = 0;
    let h = 0;
    let t = 0;
    let raf = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render(animated: boolean) {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / GAP) + 1;
      const rows = Math.ceil(h / GAP) + 1;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          let a = 0.07;
          if (animated) {
            const wave = Math.sin((i + j) * 0.45 - t * 0.045);
            a = 0.045 + Math.max(0, wave) * 0.2;
          }
          ctx.beginPath();
          ctx.arc(i * GAP, j * GAP, R, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},${a})`;
          ctx.fill();
        }
      }
    }

    function loop() {
      t += 1;
      render(true);
      raf = requestAnimationFrame(loop);
    }

    resize();
    if (reduce) {
      render(false);
    } else {
      loop();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) render(false);
    });
    ro.observe(canvas);

    // Pause the loop when the tab is hidden so it never burns frames in the
    // background; resume on return.
    function onVisibility() {
      if (reduce) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) loop();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
