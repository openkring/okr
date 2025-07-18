const nx = require('@nx/eslint-plugin');
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended, // <-- DIESE ZEILE BEHEBT DEN FEHLER
});

module.exports = [
  {
    plugins: {
      '@nx': nx,
    },
  },
  ...compat.config({
    extends: ['plugin:@nx/typescript', 'plugin:@nx/angular'],
  }).map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...config.rules,
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:model', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:constants', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:config', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:api', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'platform:node'] },
          ],
        },
      ],
    },
  })),
  ...compat.config({
    extends: ['plugin:@nx/javascript'],
  }).map((config) => ({
    ...config,
    files: ['**/*.js', '**/*.jsx'],
    rules: {
      ...config.rules,
    },
  })),
  {
    ignores: ['node_modules', 'tmp', '**/android', '**/ios', '**/web'],
  }
];