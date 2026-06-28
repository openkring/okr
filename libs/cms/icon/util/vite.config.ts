import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/cms/icon/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    setupFiles: ['./test-setup.ts'],
    // only keep project-specific settings here
    coverage: {
      reportsDirectory: '../../../../coverage/libs/cms/icon/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
