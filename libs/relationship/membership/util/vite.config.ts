import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/relationship/membership/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // membership.util transitively imports the @bk2/shared-util-angular barrel (Ionic-coupled);
    // inline @ionic so Vite resolves its directory imports instead of failing ESM resolution.
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/] } },
    // only keep project-specific settings here
    coverage: {
      reportsDirectory: '../../../../coverage/libs/relationship/membership/util',
      provider: 'v8' as const,
    },
    setupFiles: ['./test-setup.ts'],
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);