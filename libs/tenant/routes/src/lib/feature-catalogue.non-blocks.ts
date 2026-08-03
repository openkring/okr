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
// keyed by TOP-LEVEL domain name only, never per-subdomain.
//
// Task 12 (core bundle) drained: auth, avatar, category, cms, comment, geo, i18n, profile,
// security, user (plus consent and session, which — per the note this replaces — are
// correctly absent from this list: neither has a `feature` directory at depth 1 or depth 2,
// so `featureDomains()` never surfaces them, but both are still catalogued in
// `FEATURE_BLOCKS` because the task brief names them explicitly).
//
// CONSEQUENCE of that blind spot (task 12 review round 2, minor a): because
// `featureDomains()` structurally cannot see `consent`/`session`, the completeness test
// would NOT go red if either were ever removed from `FEATURE_BLOCKS` — there is no
// `libs/consent/feature` or `libs/session/feature` directory to flag them missing. Nothing
// in this file's test suite catches that regression; only `feature-blocks.spec.ts`'s
// key===name check and manual review would. Keep this in mind before ever deleting either
// block's entry.
//
// Task 13 (members bundle) drained: subject, relationship, vcard.
// Task 14 (events bundle) drained: resource, mobility. (`calevent` was never in this list —
// catalogued since task 5.)
//
// Task 15 (finance bundle) drained: finance, esign, pdf-template. Note `finance` is the
// container domain for all THIRTEEN `libs/finance/*` subdomains (the task brief names twelve;
// `exchange-rate` is a 13th, route-less and menu-less) — consistent with the top-level-only
// keying described above. Neither `activity` nor `task` was drained here even though `finance`
// imports both (`@okr/activity-data-access`, `@okr/task-feature`): they are separate blocks
// still to be catalogued, and `finance` therefore cannot yet declare them in `dependsOn` (the
// completeness test rejects a dangling target). See the note on the `finance` block.
// Task 16 (documents bundle) drained: document, folder. Kept as TWO blocks per the brief
// even though `folder` ships no route and no menu of its own (its only list screen,
// `FolderList`, is imported by nothing) — the argument for and against merging it into
// `document` is recorded in full on the `folder` block in `feature-blocks.ts` and was raised
// with the controller rather than acted on unilaterally, because block ids are stable SKU
// keys other tasks reference by name.
// `activity` is STILL not drained, and the two edges `finance` owes therefore still cannot
// be declared: `@okr/activity-data-access` is imported by `finance` (audit-trail writes) AND
// now demonstrably by `libs/folder/data-access/src/lib/folder.service.ts:11` as well, so
// `folder` carries the same "not expressible yet" TODO. `task` likewise stays pending.
export const PENDING_CLASSIFICATION: string[] = [
  'activity', 'chat',
  'forms', 'games', 'instruments',
  'social-feed', 'task',
];
