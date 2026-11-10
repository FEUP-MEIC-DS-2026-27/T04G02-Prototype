import { defineConfig } from 'vitest/config';

// Test-only config. The app is still built by rsbuild (rsbuild.config.ts).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/support/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
