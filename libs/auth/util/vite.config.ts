import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/auth/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // only keep project-specific settings here
    // Loads the JIT compiler: the suites import AuthCredentials from @okr/shared-models, which
    // pulls in an Angular injectable, and without this every spec in the project fails at
    // collection with "PlatformLocation needs to be compiled using the JIT compiler".
    setupFiles: ['./test-setup.ts'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/auth/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);