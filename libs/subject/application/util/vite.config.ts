import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/subject/application/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // application.validations imports @okr/subject-person-util (Ionic-coupled barrel);
    // inline @ionic so Vite resolves its directory imports instead of failing ESM resolution.
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/] } },
    coverage: {
      reportsDirectory: '../../../../coverage/libs/subject/application/util',
      provider: 'v8' as const,
    },
    setupFiles: ['./test-setup.ts'],
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
