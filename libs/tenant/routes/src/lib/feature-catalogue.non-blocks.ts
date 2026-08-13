/**
 * Domains under `libs/` that are deliberately NOT feature blocks, each with the reason.
 * The completeness test fails on any domain that is neither a catalogue block nor listed
 * here — mirroring the privacy subject-data-map pattern, so a new domain cannot be
 * forgotten silently.
 *
 * THERE IS NO ESCAPE HATCH ANY MORE, and that is deliberate. A temporary
 * `PENDING_CLASSIFICATION` array existed from task 6 to task 18 so the catalogue could be
 * filled one bundle at a time; it was drained bundle by bundle and DELETED, not left empty,
 * in task 18 — an empty "add it here for now" list gets refilled by the next person, and the
 * completeness test then silently stops meaning anything. If you are adding a new
 * `libs/<domain>/feature` and the test is red: decide. Either it is a product feature (add a
 * `FeatureBlock` to `FEATURE_BLOCKS` in `@okr/tenant-util` AND a `BlockRoutes` entry to
 * `FEATURE_ROUTES` here — the sync test requires both, `routes: () => []` is fine for a domain
 * with no routable screen), or it is cross-cutting infrastructure (add it below with a
 * one-line reason). "Later" is not one of the options; do not reintroduce the array.
 *
 * THE BAR FOR THIS LIST IS INFRASTRUCTURE OR A MERGED DOMAIN — NEVER UNFINISHEDNESS. Two of
 * the three entries below are cross-cutting machinery with no product surface of their own;
 * the third (`folder`) is a domain whose product surface is catalogued, but under ANOTHER
 * block's id after the repo owner merged it. An incomplete or barely-used product FEATURE
 * still belongs in the catalogue as a block of its own — `social-feed` (an unwired stub with a
 * `localhost` data source) and `games` (a hard-coded in-memory quiz) were both argued out at
 * length and both stayed blocks; the owner then ruled both `defaultAvailability: 'disabled'`
 * on 2026-08-04, which is the lever for keeping a feature out of a tenant's picker. This list
 * is not that lever, and "not finished yet" is not a reason to be on it.
 */
export const NON_BLOCK_DOMAINS: Record<string, string> = {
  shared: 'cross-cutting infrastructure, not a feature',
  tenant: 'this domain — the catalogue itself',
  // Owner ruling 2026-08-04: merged into the `document` block, which now declares the `folders`
  // collection this domain owns. `libs/folder/**` still exists (and `libs/folder/feature` is
  // why this entry is required), but it ships no route and no menu doc of its own — every one
  // of its consumers also uses `@okr/document-*`. Full argument on the `document` block.
  folder: 'merged into the `document` block (2026-08-04); `document` declares its `folders` collection',
  // `libs/system/workflow/**` (spec 1.35). The rule ENGINE runs in a Cloud Function and fires
  // on every membership write regardless of any tenant setting, so a block toggle could not
  // turn the behaviour off — it would only hide the admin screen and leave rules running
  // invisibly. Its ROUTE is contributed by the `aoc` block (the AOC submenu owns its menu row);
  // this domain itself stays uncatalogued — control plane, not a product feature.
  system: 'control plane (workflow rules); the rule engine is server-side and cannot be block-gated',
};

/*
 * ── Catalogue decisions worth preserving (this block documents no symbol) ──────────────────
 *
 * A KNOWN BLIND SPOT IN THE COMPLETENESS TEST, recorded here because nothing else catches it
 * (task 12 review round 2, minor a). `featureDomains()` finds a domain only through a
 * `libs/<name>/feature` or `libs/<name>/<sub>/feature` directory. `consent` and `session` have
 * neither — yet both ARE catalogued in `FEATURE_BLOCKS` (their briefs named them explicitly,
 * and both are real `core: true` blocks). The test would therefore NOT go red if either were
 * ever deleted from `FEATURE_BLOCKS`: there is no directory to flag them missing. Only
 * `feature-blocks.spec.ts`'s own assertions and manual review would notice. Keep this in mind
 * before removing either block's entry.
 *
 * WHY NO REVERSE EDGES WERE DRAWN FOR THE GROUP VIEW'S EMBEDDED LISTS — the single decision
 * this file's history exists to preserve, because it is the one a future reader is most likely
 * to "fix" into a cycle. `libs/subject/group/feature/group-view.page.ts` embeds FOUR other
 * blocks' list components as segments — `CalEventList`, `MembershipList`, `DocumentList` and
 * `TaskList` — plus a `PageDispatcher` for the chat segment, and hoists SIX context wrappers
 * out of them (`c-contentpage`, `c-calevents`, `c-tasks`, `c-folder`, `c-groupmembers`,
 * `contextMenuChat`). Under the dividing line each embedded component looks like an edge, but
 * `calevent` and `relationship` ALREADY declare `dependsOn: ['subject', …]`, so the mirror
 * edge would close a cycle in both cases. The resolution, settled across tasks 16-18 and not
 * to be re-argued:
 *  - `document` / `task` — no existing edge in the other direction, so `subject` declares a
 *    plain EDGE to each (`dependsOn: ['document', 'task']`; it read `['document', 'folder',
 *    'task']` until the `folder` block was merged into `document` on 2026-08-04).
 *  - `calevent` / `relationship` — NO reverse edge. Their wrappers are catalogued on the block
 *    that owns the dispatching component (`c-calevents` on `calevent`, `c-groupmembers` on
 *    `relationship`), which is what actually keeps the segments working.
 *  - `chat` — no edge either; `subject` CO-DECLARES `contextMenuChat` instead, because only a
 *    menu doc crosses that boundary (the segment embeds core `PageDispatcher`, not a chat
 *    component). An edge would have made an external processor with no DPA always-on for every
 *    member-management tenant.
 * A cycle would not crash — `resolveWithDeps` (`feature-deps.util.ts`) terminates on one, and
 * `feature-deps.util.spec.ts:40` pins that — which is exactly why the damage is silent:
 * enablement becomes MUTUAL (two separately switchable blocks quietly fuse into one) and the
 * picker's `dependents_confirm` message, generated from the same graph, states a dependency
 * direction that is not real. `feature-catalogue.completeness.spec.ts` now rejects any cycle
 * and names the offending path. Do not soften it to make an edge pass.
 *
 * ALSO SETTLED, so it is not rediscovered as a gap: `activity` is owed NO edges at all. Every
 * import of `@okr/activity-data-access` from a catalogued block resolves to one of exactly TWO
 * calls — `ActivityService.log(…)` or `…logAuth(…)` (the log-in/log-out variant, six sites: five
 * in `auth`, one in `cms/menu`) — and both are audit-trail writes, invisible on the calling
 * block's own surface, i.e. the "no edge" side of the dividing line. Two TODOs claiming
 * otherwise (on `finance` and on the then-separate `folder` block, since merged into
 * `document`) were retracted in task 17. See the `activity` block's
 * own comment for the exact counts, how to reproduce them, and what this means for retention.
 */
