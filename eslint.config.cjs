const nx = require('@nx/eslint-plugin');

const allowedFrontendExternalImports = [
  'jest-preset-angular/*',
  '@angular/*',
  '@ionic/*',
  'ionicons*',
  '*capacitor*',
  'rxjs',
  '*fire*',
  '*echarts*',
  '*vest*',
  '@iplab*',
  '@maskito*',
  '@jsverse/transloco',
  '@ngx-translate*',
  'ngx-editor',
  '@fullcalendar*',
  'stream-chat*',
  'date-fns',
  'swiper*',
  '@ngrx*',
  'mime',
  'xlsx',
  'jszip',
  'file-saver'
];

const allowedBackendExternalImports = ['express', '@faker-js/faker'];

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/android', '**/ios', '**/web'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:model',
                'platform:mobile',
                'platform:web',
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:api',
              onlyDependOnLibsWithTags: ['type:model', 'platform:node'],
              allowedExternalImports: allowedBackendExternalImports,
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data',
                'type:util',
                'type:model',
                'type:config'
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:data',
                'type:util',
                'type:model',
                'type:config'
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:data',
              onlyDependOnLibsWithTags: [
                'type:data',
                'type:util',
                'type:model',
                'type:config',
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: [
                'type:util',
                'type:model',
                'type:config'
              ],
              allowedExternalImports: [
                'echarts',
                '@capacitor/*',
                '@ionic/*',
                'rxjs',
                '*vest*',
                '@angular*',
                'firebase*',
                'date-fns',
                '*fullcalendar*',
                '*transloco*',
                '*jest*',
                'xlsx',
                'jszip',
                'file-saver',
                'crypto-js',
                'mime'
              ],
            },
            {
              sourceTag: 'type:model',
              onlyDependOnLibsWithTags: [
                'type:model',
                'type:config'
              ],
              allowedExternalImports: [
                'echarts',
                '*angular*',
                'ngx-vest-forms',
                '*fullcalendar*'
              ],
            },
            {
              sourceTag: 'type:config',
              onlyDependOnLibsWithTags: []
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: [ 'scope:shared']
            },
            {
              sourceTag: 'platform:node',
              onlyDependOnLibsWithTags: ['platform:node'],
              allowedExternalImports: allowedBackendExternalImports,
            },
            {
              sourceTag: 'platform:mobile',
              onlyDependOnLibsWithTags: ['platform:mobile'],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'platform:web',
              onlyDependOnLibsWithTags: ['platform:web'],
              allowedExternalImports: allowedFrontendExternalImports,
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
