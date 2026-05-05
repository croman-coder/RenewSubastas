'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
// next-themes@0.3.0 doesn't re-export ThemeProviderProps from the root.
// Using the internal path until the package upgrades its exports map.
import type { ThemeProviderProps } from 'next-themes/dist/types';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
