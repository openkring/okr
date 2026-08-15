const nx = require('@nx/eslint-plugin');
const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },

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
      //   ...prettierConfig.rules, // Disable conflicting ESLint rules
      //   'prettier/prettier': ['error', {}, { usePrettierrc: true }], // Run Prettier as ESLint rule
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            // Type-based layering (existing)
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'type:model', onlyDependOnLibsWithTags: ['type:constants'] },
            { sourceTag: 'type:constants', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:config', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:api', onlyDependOnLibsWithTags: ['type:util', 'type:model', 'type:constants', 'platform:node'] },

            // Scope-based domain enforcement (add your actual scopes as needed)
            { sourceTag: 'scope:person', onlyDependOnLibsWithTags: ['scope:person', 'scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'scope:org', onlyDependOnLibsWithTags: ['scope:org', 'scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'scope:resource', onlyDependOnLibsWithTags: ['scope:resource', 'scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'scope:membership', onlyDependOnLibsWithTags: ['scope:membership', 'scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            { sourceTag: 'scope:calevent', onlyDependOnLibsWithTags: ['scope:calevent', 'scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
            // Shared scope for cross-domain utilities/models
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared', 'type:util', 'type:model', 'type:constants', 'type:config'] },
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
      //   ...prettierConfig.rules,
      //   'prettier/prettier': ['error', {}, { usePrettierrc: true }],
    },
  },
  // Angular templates. Inline templates are extracted by the Angular processor above, so these
  // rules cover both `templateUrl` files and the inline `template:` strings this repo uses. This
  // block MUST stay after nx.configs['flat/javascript'] — that config ends with a fileless block
  // whose parser would otherwise clobber the template parser and break every inline template.
  // Only the a11y rules the codebase passes today are on — see UI audit finding 19.
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.html'],
    rules: {
      '@angular-eslint/template/alt-text': 'error',
      '@angular-eslint/template/valid-aria': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
      // Off until UI-audit finding 7 (icon-only buttons without an accessible name) is remediated.
      // Turning these on today would fail the lint of most feature libs.
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
      '@angular-eslint/template/elements-content': 'off',
      '@angular-eslint/template/label-has-associated-control': 'off',
      '@angular-eslint/template/mouse-events-have-key-events': 'off',
      '@angular-eslint/template/no-autofocus': 'off',
      '@angular-eslint/template/no-distracting-elements': 'off',
      '@angular-eslint/template/table-scope': 'off',
    },
  },

  {
    ignores: ['node_modules/', 'dist/', 'coverage/', 'apps/*/node_modules/', 'libs/*/dist/', '.angular', '.github', '.idx', '.nx', '.vscode', 'tmp', '**/android', '**/ios', '**/web', '**/test-setup.ts', '**/vite.config.*.timestamp*', '**/vitest.config.*.timestamp*'],
  },
];
