import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/shared/util-functions',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // only keep project-specific settings here
    // address-index.util reaches @okr/shared-util-core, whose barrel pulls in
    // @angular/common — without the JIT compiler every spec here fails at collection.
    setupFiles: ['./test-setup.ts'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/shared/util-functions',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);