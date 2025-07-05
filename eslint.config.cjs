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

const baseTags = [
  'type:util',
  'type:model',
  'type:config',
  'type:constants',
];

module.exports = [
    {
    // We are redefining the ignores from scratch to override the default
    // which ignores the `dist` directory (nx.configs['flat/base'] imports this ignore rule as default).
    // The linter needs access to `dist` to validate buildable lib dependencies.
    ignores: [
      'node_modules',
      'tmp',
      '**/android',
      '**/ios',
      '**/web',
      // IMPORTANT: We DO NOT ignore 'dist' here anymore.
    ],
  },
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:feature','type:data-access','type:ui', ...baseTags, 'platform:mobile','platform:web'],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:api',
              onlyDependOnLibsWithTags: ['type:model', 'platform:node'],
              allowedExternalImports: allowedBackendExternalImports,
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: ['type:feature','type:ui','type:data-access', ...baseTags],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui','type:data-access', ...baseTags],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:data-access', ...baseTags],
              allowedExternalImports: allowedFrontendExternalImports,
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: [...baseTags],
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
