import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/games/chess/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../coverage/libs/games/chess/util',
      provider: 'v8' as const,
    },
    setupFiles: ['./test-setup.ts'],
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
