import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/mobility/transit/data-access',
  plugins: [nxViteTsPaths()],
  test: {
    setupFiles: ['./test-setup.ts'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/mobility/transit/data-access',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
