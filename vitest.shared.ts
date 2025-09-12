import { defineConfig } from 'vitest/config';

// This file contains common Vitest settings to be shared across all libraries.
export default defineConfig({
  test: {
    // ensure tests run once and exit to prevent hanging processes.
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
});