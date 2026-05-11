import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../vitest.shared';

const appConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/functions',
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reportsDirectory: '../../coverage/apps/functions',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(appConfig, sharedTestConfig);
