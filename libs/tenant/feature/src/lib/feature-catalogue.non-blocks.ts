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
// Every entry here is a top-level `libs/` domain that is NOT yet reachable through the
// catalogue, verified by running the completeness test RED with this array emptied.
// Per the repo owner's ruling, one catalogue block covers a whole container domain (e.g.
// one `finance` block for all 13 `finance/*` subdomains, one `subject` block for
// person/org/address/group/application) — so this list, like the catalogue itself, is
// keyed by TOP-LEVEL domain name only, never per-subdomain. `consent` and `session` are
// correctly absent: neither has a `feature` directory at depth 1 or depth 2.
export const PENDING_CLASSIFICATION: string[] = [
  'activity', 'auth', 'avatar', 'category', 'chat', 'cms', 'comment', 'document',
  'esign', 'finance', 'folder', 'forms', 'games', 'geo', 'i18n', 'instruments',
  'mobility', 'pdf-template', 'profile', 'relationship', 'resource', 'security',
  'social-feed', 'subject', 'task', 'user', 'vcard',
];
