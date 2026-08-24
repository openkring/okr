const nx = require('@nx/eslint-plugin');
const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/**
 * The layering allowance every scope rule repeats: a domain may always reach the pure lower
 * layers, whatever domain they belong to.
 */
const LAYER_TYPES = ['type:util', 'type:model', 'type:constants', 'type:config'];

/**
 * Domains that attach to any record rather than owning one — activity log, avatar, comments,
 * navigation entries, attached documents/templates. Four or more of the constrained domains
 * already depend on each of them, so listing them per domain would be noise that hides the
 * dependencies worth reading.
 */
const CROSS_CUTTING = ['scope:activity', 'scope:avatar', 'scope:comment', 'scope:content', 'scope:menu'];

/** What every constrained domain gets before its own specific dependencies. */
const SCOPE_BASE = (own) => [`scope:${own}`, 'scope:shared', ...LAYER_TYPES, ...CROSS_CUTTING];

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

            // Scope-based domain enforcement. Only the scopes listed here are constrained at
            // all — the other ~44 scope tags have no rule and are therefore unrestricted.
            //
            // Each list names the domains that scope ACTUALLY reaches today (see SCOPE_* below).
            // That is the point: the lists used to hold only the domain itself, so every rule was
            // violated several times over and the whole check read as noise. Pinned to reality it
            // becomes a ratchet — a NEW cross-domain dependency fails lint and has to be added
            // here on purpose. Do not widen a list to silence an error without deciding that the
            // dependency belongs.
            { sourceTag: 'scope:person', onlyDependOnLibsWithTags: [...SCOPE_BASE('person'), 'scope:address', 'scope:chat', 'scope:membership', 'scope:ownership', 'scope:personal-rel', 'scope:reservation', 'scope:swisscities', 'scope:vcard', 'scope:workrel'] },
            { sourceTag: 'scope:org', onlyDependOnLibsWithTags: [...SCOPE_BASE('org'), 'scope:address', 'scope:finance', 'scope:membership', 'scope:ownership', 'scope:reservation', 'scope:swisscities', 'scope:vcard'] },
            { sourceTag: 'scope:resource', onlyDependOnLibsWithTags: [...SCOPE_BASE('resource'), 'scope:reservation'] },
            { sourceTag: 'scope:membership', onlyDependOnLibsWithTags: [...SCOPE_BASE('membership'), 'scope:address', 'scope:chat', 'scope:finance', 'scope:ownership', 'scope:person', 'scope:swisscities', 'scope:vcard'] },
            { sourceTag: 'scope:calevent', onlyDependOnLibsWithTags: [...SCOPE_BASE('calevent'), 'scope:alias', 'scope:chat', 'scope:invitation', 'scope:location', 'scope:membership'] },
            // Shared scope for cross-domain utilities/models. Deliberately NOT given the
            // cross-cutting set: shared sits below the domains, so what it reaches upward is
            // the interesting part and stays enumerated.
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared', ...LAYER_TYPES, 'scope:avatar', 'scope:location', 'scope:menu', 'scope:responsibility', 'scope:session'] },
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
