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
// (Task 15/16 also left "not expressible yet" TODOs for `activity` on `finance` and `folder`.
// Those were RETRACTED in task 17 fix round 1 — see the next paragraph.)
//
// Task 17 (communication bundle) drained: chat, social-feed, forms. All three stay BLOCKS,
// none moved to `NON_BLOCK_DOMAINS` — including `social-feed`, which today is an unwired stub
// (no app route, no importer anywhere, a `localhost` data source) but is an unfinished
// product feature rather than infrastructure; the full evidence is on its block in
// `feature-blocks.ts`. `chat` and `social-feed` both ship `routes: () => []`: chat's screen is
// a CMS page rendered through the `cms` block's route, and social-feed has no registered route
// at all.
//
// `activity` and `task` are still not drained (neither is in this bundle), but the picture for
// them changed in task 17 fix round 1, so READ THIS BEFORE TASK 18:
//  - `activity` is owed NOTHING. The TODOs on `finance` and `folder` were removed. Every
//    import of `@okr/activity-data-access` from an already-catalogued block turns out to be
//    `ActivityService.log(...)` — an audit-trail write invisible on the calling block's own
//    surface (`folder.service.ts:36/47/54`, `bill.service.ts`/`invoice.service.ts`,
//    `matrix-chat.service.ts`). Under the dividing line now recorded in the series
//    conventions, that is the "no edge" case. Cataloguing `activity` therefore does not
//    require going back and adding edges to those blocks.
//  - `task` is owed TWO things, not one. Fix round 2 said "one edge, by `finance`"; that
//    inventory was INCOMPLETE and would have left a broken screen behind (fix round 3).
//
//    (a) `finance` → `task` — a real EDGE. `expense.store.ts:123` destructures `TaskEditModal`
//        out of a dynamic import of the task feature lib: a component crossing the block
//        boundary, the first arm of the dividing line. A `TODO(task 18 — 'task')` on the
//        `finance` block records it. Honour it.
//
//    (b) `subject` → `task` — the SAME first arm, and additionally a wrapper doc.
//        `group-view.page.ts:18` imports `TaskList` from `@okr/task-feature` and renders it at
//        template line 138 as `<okr-task-list … contextMenuName="c-tasks" …>`; the group
//        toolbar hoists that key (`segmentContextMenuName()`, `case 'tasks': return 'c-tasks'`)
//        and delegates the popover back to `TaskList.onPopoverDismiss` (line 332). This is
//        structurally the `subject`-embeds-`DocumentList` archetype, one segment over.
//        DECISION RULE for whoever catalogues `task` — do NOT guess, check `task`'s own
//        `dependsOn` at the time:
//          * if `task` does NOT depend on `subject` → declare `subject → task` as a normal EDGE;
//          * if `task` DOES depend on `subject` → the edge would close a CYCLE. Do not declare
//            it; CO-DECLARE `c-tasks` (and its children) on `subject` instead, exactly as
//            `subject` co-declares `contextMenuChat` today. See that block for the pattern and
//            the reasoning, and the `CalEventList`/`MembershipList` note below for why a cycle
//            is the wrong answer even though nothing would crash.
//        EVIDENCE AS OF TASK 17 (re-verify, do not inherit): `libs/task` imports no `@okr/subject-*`
//        lib at all — its only non-`shared` imports are `comment`, `cms-menu`, `avatar` (all
//        `core: true`) and `activity` (the no-edge class above). On that evidence the first
//        branch applies and a plain edge is correct.
//
//    (c) `c-tasks` IS CATALOGUED NOWHERE — zero hits across `libs/tenant` — and whoever owns
//        `task` must catalogue it, on the `task` block (its three children map 1:1 onto
//        `TaskList.onPopoverDismiss`'s own verbs: `task-add`→`add`, `task-export`→`export`,
//        `filter-toggle`→`toggleFilter`; same reason `c-folder` sits on `document`, the block
//        whose list component dispatches it). This holds under BOTH branches of (b) — an edge
//        does not catalogue a doc. It is one of the wrappers the automated coverage test
//        structurally cannot see: it is hoisted in `group-view.page.ts`, never derived from a
//        `navigate` url. Unlike `c-folder` it is NOT broken in production today — the live doc
//        (`menuItems/c-tasks`, `action: context`, `roleNeeded: privileged`, children
//        `[task-add, task-export, filter-toggle]`) is already on all 16 tenants — so this is an
//        uncatalogued doc, not an outage. Note the two action children are narrower:
//        `task-add`/`task-export` are `tenants: ['test','scs']` only.
//
// WHY `subject` DECLARES NO EDGE FOR `CalEventList` / `MembershipList`, which the same file also
// embeds (`group-view.page.ts:20`/`:17`, rendered at template lines 129/162) — do not "fix" this
// into a cycle: `calevent` and `relationship` BOTH already declare `dependsOn: ['subject', …]`,
// so a reverse edge from `subject` would close a cycle in each case. `resolveWithDeps`
// (`feature-deps.util.ts`) would not crash — its `visited` set makes cycles terminate, and
// `feature-deps.util.spec.ts:40` pins exactly that — and NO test rejects a cycle in the real
// catalogue, so nothing would go red. The damage would be silent instead: the edge makes
// enablement mutual, so a tenant could never run `subject` without `calevent`/`relationship`,
// and the picker's dependency messaging would state a falsehood. Their wrappers are handled the
// right way already — `c-calevents` is catalogued on `calevent`, `c-groupmembers` on
// `relationship` — which is the whole point: cataloguing the wrapper, not drawing the edge, is
// what keeps the group view's segments working. `c-tasks` is the only one of the group view's
// six hoisted wrappers (`c-contentpage`, `c-calevents`, `c-tasks`, `c-folder`,
// `c-groupmembers`, `contextMenuChat`) still missing from the catalogue.
export const PENDING_CLASSIFICATION: string[] = [
  'activity', 'games', 'instruments', 'task',
];
