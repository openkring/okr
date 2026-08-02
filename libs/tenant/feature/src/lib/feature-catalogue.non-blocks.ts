/**
 * Domains under `libs/` that are deliberately NOT feature blocks, each with the reason.
 * The completeness test fails on any domain that is neither a catalogue block nor listed
 * here — mirroring the privacy subject-data-map pattern, so a new domain cannot be
 * forgotten silently.
 */
export const NON_BLOCK_DOMAINS: Record<string, string> = {
  shared: 'cross-cutting infrastructure, not a feature',
  tenant: 'this domain — the catalogue itself',
};

// ⚠️ TEMPORARY — drained bundle by bundle in Tasks 12-18, deleted entirely in Task 18.
// Every entry here is a feature domain that is NOT yet reachable through the catalogue.
// This list reflects the domains the completeness test's one-level `libs/<name>/feature`
// walk actually reports as unclassified today (verified by running the test RED before
// this array existed) — not the larger set of domains under `libs/` overall. Several
// `libs/*` directories (e.g. `finance`, `subject`, `geo`, `relationship`, `security`,
// `session`, `mobility`, `games`, `cms`, `consent`) are container namespaces whose real
// feature libs live one level deeper (e.g. `libs/finance/invoice/feature`); the walk
// does not see them and they are therefore not represented here either — see the task-6
// report for the coverage-gap finding.
export const PENDING_CLASSIFICATION: string[] = [
  'activity', 'auth', 'avatar', 'category', 'chat', 'comment', 'document', 'esign',
  'folder', 'forms', 'i18n', 'instruments', 'pdf-template', 'profile', 'resource',
  'social-feed', 'task', 'user', 'vcard',
];
