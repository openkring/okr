import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/category/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    // The pure category util functions (isCategoryList, getCategoryAttribute, ...) were moved to
    // @bk2/shared-util-core (commit d31e685b). This lib now only holds the Vest validation suite and
    // the i18n key map, so there are no util functions left here to unit-test.
    passWithNoTests: true,
    // only keep project-specific settings here
    coverage: {
      reportsDirectory: '../../../coverage/libs/category/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);