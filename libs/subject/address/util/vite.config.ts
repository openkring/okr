import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/subject/address/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    setupFiles: ['./test-setup.ts'],  // load @angular/compiler so JIT-compiled Angular deps in the import graph don't fail
    // address.util transitively imports the @bk2/shared-util-angular barrel (Ionic-coupled);
    // inline @ionic so Vite resolves its directory imports instead of failing ESM resolution.
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/] } },
    // only keep project-specific settings here
    coverage: {
      reportsDirectory: '../../../../coverage/libs/subject/address/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);