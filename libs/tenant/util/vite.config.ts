import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/tenant/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    setupFiles: ['./test-setup.ts'],
    server: {
      deps: {
        // menu-outline.util.ts pulls in @okr/cms-menu-util, whose menu.util.ts imports
        // @okr/shared-util-angular's navigateByUrl — and that barrel's other files import
        // real (non-type) Ionic components. Ionic ships ESM directory imports Node's
        // resolver rejects; inline them so Vite transforms them with its bundler instead
        // (mirrors tenant-feature's vite.config.ts, which needed the same fix earlier).
        inline: [/@ionic\//],
      },
    },
    coverage: {
      reportsDirectory: '../../../coverage/libs/tenant/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
