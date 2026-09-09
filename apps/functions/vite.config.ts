import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../vitest.shared';

const appConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/functions',
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['./test-setup.ts'],
    // The vcard function imports @okr/vcard-util, whose barrel now re-exports the import
    // mapper; that reaches createFavoriteAddress in @okr/subject-address-util, and
    // address.util.ts imports ToastController from @ionic/angular. Node's ESM resolver
    // rejects Ionic's directory import, so src/vcard/index.spec.ts cannot even load
    // without inlining. Test-time only — the production esbuild bundle is verified to
    // contain no Ionic. Same fix as libs/subject/address/util and libs/vcard/util.
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/] } },
    coverage: {
      reportsDirectory: '../../coverage/apps/functions',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(appConfig, sharedTestConfig);
