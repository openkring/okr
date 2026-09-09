import '@angular/compiler';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/vcard/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // vcard-import-mapping imports @okr/subject-address-util (createFavoriteAddress), which
    // transitively imports @ionic/angular; inline it so Vite resolves its directory imports
    // instead of Node's ESM resolver rejecting them (same fix as address.util's own vite.config).
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/] } },
    // only keep project-specific settings here
    coverage: {
      reportsDirectory: '../../../coverage/libs/vcard/util',
      provider: 'v8' as const,
    },
    setupFiles: ['./test-setup.ts'],
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
