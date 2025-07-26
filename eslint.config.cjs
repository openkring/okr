const nx = require('@nx/eslint-plugin');
const js = require('@eslint/js');

module.exports = [
  {
    plugins: {
      '@nx': nx,
    },
  },
  // TS/TSX files (replaces compat for @nx/typescript and @nx/angular)
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/angular'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: [
          'apps/*/tsconfig.app.json',
          'libs/*/tsconfig.lib.json',
          'apps/*/tsconfig.spec.json',
          'libs/*/tsconfig.spec.json',
        ],
      },
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature','type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:model', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:constants', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:config', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:api', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'platform:node'] },
          ],
        },
      ],
    },
  },
  // JS/JSX files (replaces compat for @nx/javascript)
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      // Add any custom JS rules here if needed
    },
  },
  {
    ignores: [
      'node_modules', 
      'tmp', 
      '**/android', 
      '**/ios', 
      '**/web',
      '**/jest.config.ts',
      '**/test-setup.ts'
    ],
  }
];