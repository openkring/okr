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
    // No `parserOptions.project` / `projectService`: no enabled rule needs type information
    // (none sets `requiresTypeChecking`), so a TypeScript program would be pure cost. The old
    // `project` glob matched ~850 tsconfigs, each pulling the @okr/* sources in through the path
    // map — that is what made one lib lint take a minute and 8 GB before running out of heap.
    // If a type-aware rule is ever added, use `projectService: true` (nearest tsconfig per file),
    // never a tsconfig glob. Type errors are caught by `nx build` / `tsc --noEmit`, not ESLint.
    rules: {
      //   ...prettierConfig.rules, // Disable conflicting ESLint rules
      //   'prettier/prettier': ['error', {}, { usePrettierrc: true }], // Run Prettier as ESLint rule
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          // Nx flags a static import of a lib that the SAME project also import()s anywhere. This repo
          // decides lazy loading per FILE (a store import()s a modal or matrix-js-sdk's barrel; another
          // file of the project imports the lib statically on a page that needs it), so for these
          // libs the check fired on deliberate patterns (2026-11-18, 26 errors). The bundle guard is
          // the perf-budget gate + scripts/bundle-closure.mjs (lazy-loading skill), not this check.
          // Do not add a lib here to silence a NEW error: first check whether its import() buys
          // anything — an import() of a lib the chunk already binds statically is dead weight.
          checkDynamicDependenciesExceptions: [
            '@okr/auth-feature', '@okr/calendar-calevent-feature', '@okr/calendar-course-ui', '@okr/chat-data-access',
            '@okr/cms-section-feature', '@okr/content-pdf-template-ui', '@okr/finance-payment-ui', '@okr/forms-ui',
            '@okr/forms-util', '@okr/games-jasstafel-ui', '@okr/project-task-ui', '@okr/shared-config',
            '@okr/tenant-feature', '@okr/trip-ui',
          ],
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
            // scope:finance + scope:tenant — person finance accordions 2026-11-14: the person modal/page lists the person's invoices
            // and bills (FeatureStore gate) and mounts both accordions through a DYNAMIC import, so finance stays out of this chunk's static graph.
            { sourceTag: 'scope:person', onlyDependOnLibsWithTags: [...SCOPE_BASE('person'), 'scope:address', 'scope:chat', 'scope:finance', 'scope:household', 'scope:membership', 'scope:org', 'scope:ownership', 'scope:personal-rel', 'scope:reservation', 'scope:swisscities', 'scope:tenant', 'scope:vcard', 'scope:workrel'] },
            // scope:social — webcam places 2026-11-09: the org modal lists an org's webcams (news-center data-access) and mounts
            // NewsWebcamPanel through a DYNAMIC import, so the news-center feature stays out of this chunk's static graph.
            { sourceTag: 'scope:org', onlyDependOnLibsWithTags: [...SCOPE_BASE('org'), 'scope:address', 'scope:finance', 'scope:membership', 'scope:ownership', 'scope:reservation', 'scope:social', 'scope:swisscities', 'scope:tenant', 'scope:vcard', 'scope:workrel'] },
            { sourceTag: 'scope:resource', onlyDependOnLibsWithTags: [...SCOPE_BASE('resource'), 'scope:reservation', 'scope:ownership'] },
            { sourceTag: 'scope:membership', onlyDependOnLibsWithTags: [...SCOPE_BASE('membership'), 'scope:address', 'scope:chat', 'scope:finance', 'scope:ownership', 'scope:person', 'scope:swisscities', 'scope:vcard'] },
            // scope:course — spec 1.132: the «Kurse» chip of a group calendar asks CourseService (data-access only), through a
            // DYNAMIC import (lazyService), so the course libs stay out of this chunk's static graph.
            // scope:user — the calevent store marks an event's activity as seen through SeenService
            // (user data-access), the per-user ledger behind the unread-activity badge.
            // scope:trainer-billing — spec 1.167 §7.3: a calendar event records a trainer's work (TrainerBillingService + WorkEntryEditModal through a
            // DYNAMIC import); only the trainer-billing libs carry this tag, never the ledger/bill libs (scope:finance stays out).
            { sourceTag: 'scope:calevent', onlyDependOnLibsWithTags: [...SCOPE_BASE('calevent'), 'scope:alias', 'scope:chat', 'scope:course', 'scope:invitation', 'scope:location', 'scope:mandate', 'scope:membership', 'scope:mobility', 'scope:trainer-billing', 'scope:user'] },
            // Shared scope for cross-domain utilities/models. Deliberately NOT given the
            // cross-cutting set: shared sits below the domains, so what it reaches upward is
            // the interesting part and stays enumerated.
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared', ...LAYER_TYPES, 'scope:avatar', 'scope:location', 'scope:menu', 'scope:responsibility', 'scope:session'] },
          ],
        },
      ],
      // ion-img is deprecated in Ionic 9 and removed in 10 (spec 1.96): use <img okrImg> (ImgDirective).
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@ionic/angular', importNames: ['IonImg'], message: 'Use <img okrImg> (ImgDirective from @okr/shared-ui) instead of the deprecated ion-img.' }] },
      ],
      // Spec 1.176: readers import the barrel of @okr/cms-article-feature statically, and it also exports the canvas and the
      // surface of the editor. An import() of it makes every export eager (lazy-loading skill). The Angular
      // compiler writes such an import() itself for a component that a file uses only inside @defer. Passed on by another
      // barrel it would be out of reach of this guard.
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression[source.value='@okr/cms-article-feature']",
          message: 'An import() of this barrel makes the article editor eager. Use a loader function of @okr/cms-article-feature (relative import() inside the lib).',
        },
        {
          selector: 'ImportExpression > TemplateLiteral > TemplateElement[value.raw="@okr/cms-article-feature"]',
          message: 'An import() of this barrel makes the article editor eager. Use a loader function of @okr/cms-article-feature (relative import() inside the lib).',
        },
        {
          selector: "ExportAllDeclaration[source.value='@okr/cms-article-feature'][exportKind='value'], ExportNamedDeclaration[source.value='@okr/cms-article-feature'][exportKind='value']:has(ExportSpecifier[exportKind='value'])",
          message: 'Do not pass on this barrel: an import() of yours would make the article editor eager. Import from @okr/cms-article-feature where it is used; types may be passed on.',
        },
        {
          selector: "Program:has(ImportDeclaration[source.value='@okr/cms-article-feature'][importKind='value']) TemplateElement[value.raw=/@defer\\s*[({]/]",
          message: 'A component of @okr/cms-article-feature that is used only inside @defer becomes an import() of its barrel and makes the article editor eager. Create it with a loader function and createComponent.',
        },
      ],
    },
  },
  // The same barrel from the inside: esbuild skips a barrel (sideEffects: false) as long as it only passes on with `export *`.
  // One `export { x } from` that somebody uses puts the barrel itself into the bundle, and with it every file it names
  // (measured 2026-11-25: the canvas, 20 KB gzip, on the dashboard).
  {
    files: ['libs/cms/article/feature/src/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ExportNamedDeclaration[exportKind='value'], ExportAllDeclaration[exported], ExportDefaultDeclaration, ImportDeclaration[importKind='value']",
          message: 'Only `export *` and `export type` here: anything else makes the article editor eager (spec 1.176).',
        },
      ],
    },
  },
  // Build/test tooling configs are not library code: every lib's vite.config.ts imports the root
  // `vitest.shared` by relative path, which the boundary rule would flag as importing the root project.
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts', '**/vitest.config.mts'],
    rules: { '@nx/enforce-module-boundaries': 'off' },
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
    // apps/functions/**/*.html are Handlebars templates and **/fixtures/** are test inputs — neither
    // is an Angular template, so the angular-template parser would only misreport them.
    ignores: ['apps/functions/src/**/*.html', '**/fixtures/**', 'node_modules/', 'dist/','coverage/', 'apps/*/node_modules/', 'libs/*/dist/', '.angular', '.github', '.idx', '.nx', '.vscode', 'tmp', '**/android', '**/ios', '**/web', '**/test-setup.ts', '**/vite.config.*.timestamp*', '**/vitest.config.*.timestamp*'],
  },
];
