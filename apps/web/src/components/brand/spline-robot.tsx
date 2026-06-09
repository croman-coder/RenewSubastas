'use client';

import { Suspense, lazy } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

interface Props {
  scene: string;
  className?: string;
}

/**
 * Interactive 3D robot (Spline), loaded lazily. Used as a decorative,
 * interactive backdrop behind the login. The scene is fetched at runtime from
 * Spline's CDN; while it loads, nothing is shown (transparent fallback) so the
 * page never flashes a placeholder box.
 */
export function SplineRobot({ scene, className }: Props) {
  return (
    <Suspense fallback={<div className={className} aria-hidden />}>
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
