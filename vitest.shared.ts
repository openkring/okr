import { defineConfig } from 'vitest/config';

// This file contains common Vitest settings to be shared across all libraries.
export default defineConfig({
  test: {
    // ensure tests run once and exit to prevent hanging processes.
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Many libs (per-module i18n maps, validation-only, barrel-only) have no unit-testable
    // code; the convention is to test util functions/services where they exist. Don't fail
    // the suite for a lib that legitimately has no spec files.
    passWithNoTests: true,
    reporters: ['default'],
  },
});