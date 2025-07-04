const nx = require('@nx/eslint-plugin');

const allowedFrontendExternalImports = [
  'jest-preset-angular/*',
  '@angular/*',
  '@ionic/*',
  'ionicons*',
  'axios',
  'express',
  'crypto-js',
  'countries-list',
  '*capacitor*',
  'i18n-iso-countries',
  'ibantools',
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
  'libphonenumber-js',
  'stream-chat*',
  'date-fns',
  'swiper*',
  '@ngrx*',
  'mime',
  'xlsx',
  'jszip',
  'file-saver'
];

const allowedBackendExternalImports = [
  'express', 
  'axios',
  '@faker-js/faker', 
  'firebase*',
  'rxfire*',
  'stream*',
  'rxjs',
  '*vest*',
  'echarts',
  '@fullcalendar*',
];

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
// TYPES
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:data-access',
                'type:ui',
                'type:util',
                'type:config',
                'type:constants',
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
                'type:data-access',
                'type:util',
                'type:model',
                'type:config',
                'type:constants',
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:data-access',
                'type:util',
                'type:model',
                'type:config',
                'type:constants',
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [
                'type:data-access',
                'type:util',
                'type:model',
                'type:config',
                'type:constants',
              ],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: [
                'type:util',
                'type:model',
                'type:config',
                'type:constants',
              ],
              allowedExternalImports: [
                'echarts',
                '@capacitor/*',
                'crypto-js',
                'countries-list',
                'ibantools',
                'i18n-iso-countries',
                '@ionic/*',
                'rxjs',
                '*vest*',
                '@angular*',
                'firebase*',
                'rxfire/*',
                'date-fns',
                '*fullcalendar*',
                'libphonenumber-js',
                '*transloco*',
                '*jest*',
                'xlsx',
                'jszip',
                'file-saver',
                'crypto-js',
                'mime'
              ],
            },
            { // buildable
              sourceTag: 'type:model',
              onlyDependOnLibsWithTags: [],
              allowedExternalImports: [
                'echarts',
                '*fullcalendar*'
              ],
            },
            {
              sourceTag: 'type:config',
              onlyDependOnLibsWithTags: [],
              allowedExternalImports: [
                '*angular*',
                'firebase*',
                '@maskito*',
              ]
            },
            { // buildable
              sourceTag: 'type:constants',
              onlyDependOnLibsWithTags: []
              // No external imports allowed for constants
            },
// SCOPES
// gemini recommends to remove this rule, because it leads to problems with dependency checks
//            {
//              sourceTag: 'scope:shared',
//              onlyDependOnLibsWithTags: [ 'scope:shared']
//            },
// PLATFORMS
            {
              sourceTag: 'platform:node',
              onlyDependOnLibsWithTags: ['platform:node'],
              allowedExternalImports: allowedBackendExternalImports,
            },
            {
              sourceTag: 'platform:mobile',
              onlyDependOnLibsWithTags: ['platform:mobile','platform:node'],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'platform:web',
              onlyDependOnLibsWithTags: ['platform:web','platform:node'],
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
