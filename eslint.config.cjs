const nx = require('@nx/eslint-plugin');
const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    plugins: {
      '@nx': nx,
      prettier,
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
        project: ['apps/*/tsconfig.app.json', 'apps/*/tsconfig.spec.json', 'libs/**/tsconfig*.json'],
      },
    },
    rules: {
      ...prettierConfig.rules, // Disable conflicting ESLint rules
      'prettier/prettier': ['error', {}, { usePrettierrc: true }], // Run Prettier as ESLint rule
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
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
      ...prettierConfig.rules,
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
    },
  },
  {
    ignores: ['node_modules', 'tmp', '**/android', '**/ios', '**/web', '**/test-setup.ts', '**/vite.config.*.timestamp*', '**/vitest.config.*.timestamp*'],
  },
];
