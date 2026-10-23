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
    // @okr/shared-util-core pulls in Angular: load the compiler for JIT (testing skill)
    setupFiles: ['./test-setup.ts'],
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
