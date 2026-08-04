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
//
// Task 17 (communication bundle) drained: chat, social-feed, forms. All three stay BLOCKS,
// none moved to `NON_BLOCK_DOMAINS` — including `social-feed`, which today is an unwired stub
// (no app route, no importer anywhere, a `localhost` data source) but is an unfinished
// product feature rather than infrastructure; the full evidence is on its block in
// `feature-blocks.ts`. `chat` and `social-feed` both ship `routes: () => []`: chat's screen is
// a CMS page rendered through the `cms` block's route, and social-feed has no registered route
// at all.
//
// `activity` and `task` are STILL not drained (neither is in this bundle), so the TODOs on the
// `finance` and `folder` blocks stay exactly as they are — nothing in this task could clear
// them. One observation for whoever does: `chat` also imports `@okr/activity-data-access`
// (`matrix-chat.service.ts:14`) and deliberately does NOT record an owed edge for it, because
// under the settled `dependsOn` semantics a data-access service import breaks no route and no
// menu row. That is arguably true of `finance`'s and `folder`'s `ActivityService` TODOs too —
// see the note on the `chat` block, and re-read all three before acting on them.
export const PENDING_CLASSIFICATION: string[] = [
  'activity', 'games', 'instruments', 'task',
];
