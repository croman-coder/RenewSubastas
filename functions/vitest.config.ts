import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ['src/**/*.test.ts'],
    exclude: ['lib/**', 'node_modules/**'],
  },
});
