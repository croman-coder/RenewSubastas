import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Same JSX runtime as Next: components don't import React, so the classic
  // transform (esbuild's default here) fails with "React is not defined" as
  // soon as a .test.tsx renders one.
  esbuild: { jsx: 'automatic' },
});
