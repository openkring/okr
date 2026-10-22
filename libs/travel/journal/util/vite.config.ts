import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/travel/journal/util',
  plugins: [nxViteTsPaths()],
  test: {
    coverage: {
      reportsDirectory: '../../../coverage/libs/travel/journal/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
