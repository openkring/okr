/**
 * Collections that hold **no personal data**, so audit check 11 does not expect a
 * subject-data-map row for them.
 *
 * This mirrors the `// not personal data:` comment block at the bottom of
 * `subject-data-map.ts`, which is the human-readable record of *why* each one is exempt.
 * The comments cannot be read at runtime (the functions bundle ships no source), so the
 * list exists twice — and `allowlist.spec.ts` reads the map's source and fails if the two
 * ever diverge. Add a collection here only together with its reasoned comment there.
 */
export const NON_PERSONAL_COLLECTIONS: ReadonlySet<string> = new Set([
  'accounting-configs',
  'accounts',
  'aliasSpaces',
  'aliasStats',
  'app-config',
  'asset-categories',
  'asset-movements',
  'boat-targets',
  'booking-lines',
  'calendars',
  'categories',
  'commissionEntries',
  'diaryImports',
  'erasure-log',
  'exchange-rates',
  'formDefinitions',
  'partners',
  'i18nDefault',
  'i18nTenantOverride',
  'icons',
  'locations',
  'menuItems',
  'ocr-rules',
  'orgs',
  'pages',
  'periods',
  'resources',
  'swissCities',
  'tags',
  'templates',
  'vat-codes',
  'websiteContent',
  'workflow-rules',
]);
