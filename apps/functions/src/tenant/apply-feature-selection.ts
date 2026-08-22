import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';

import {
  AppConfigCollection, FeatureEventCollection, FeatureRolloutCollection,
  MenuItemCollection, UserCollection, type MenuItemModel,
} from '@okr/shared-models';
import {
  indexMenuDocsByName, menuSpecNames, planMenuOps, planRootMenuOp,
  resolveAvailability, resolveWithDeps, rootNavKeys,
  type FeatureBlock, type FeatureRollout, type MenuOp,
} from '@okr/tenant-util';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

const REGION = 'europe-west6';
const CF_NAME = 'applyFeatureSelection';

/**
 * Firestore caps a WriteBatch at 500 operations (verified: firebase-admin 13.6.0,
 * `firestore.WriteBatch` — `MAX_TRANSACTION_WRITES`/batch limit is unchanged from the
 * documented 500). 400 leaves headroom, same margin the erasure pipeline uses
 * (`apps/functions/src/privacy/erasure-execute.ts`).
 */
const BATCH_SIZE = 400;

export interface SelectionPlan {
  enabled: string[];
  withheld: { id: string; reason: string }[];
}

export interface ApplyFeatureSelectionResult {
  enabled: string[];
  withheld: { id: string; reason: string }[];
  /**
   * Every enabled block that `applySelection` actually processed (menu ops planned,
   * `seed` docs written if any and absent). NOT "blocks that had seed specs" — most
   * blocks have none, and this list still includes them, because their menu subtree was
   * still applied. Named `applied`, not `seeded`, for exactly that reason (review fix
   * round 1, minor 6): the old name implied every entry wrote a `SeedSpec` doc, which is
   * false and would have misled Task 11's picker UI.
   */
  applied: string[];
}

// ────────────────────────────────────────────────────────────────────────────────────
// Pure half: expand dependencies, then drop anything rollout withholds.
// ────────────────────────────────────────────────────────────────────────────────────

/**
 * Pure half: expand dependencies, then drop anything rollout withholds. Withheld blocks
 * are REPORTED, not thrown — a tenant asking for a killed block should be told why, not
 * given an error for the whole call.
 */
export function planSelection(
  catalogue: FeatureBlock[],
  rollouts: FeatureRollout[],
  requested: string[],
  tenantId: string,
): SelectionPlan {
  const byId = new Map(catalogue.map(b => [b.id, b]));
  const rolloutById = new Map(rollouts.map(r => [r.okey, r]));

  const enabled: string[] = [];
  const withheld: { id: string; reason: string }[] = [];

  for (const id of resolveWithDeps(catalogue, requested)) {
    const block = byId.get(id);
    if (!block) continue;
    const verdict = resolveAvailability(block, rolloutById.get(id), tenantId);
    if (verdict.offered) enabled.push(id);
    else withheld.push({ id, reason: verdict.reason });
  }
  return { enabled, withheld };
}

// ────────────────────────────────────────────────────────────────────────────────────
// BUG 1 FIX — shared parent menu docs: thread planned ops back into `existing`.
//
// `planMenuOps` is pure and only sees the map it is given. If block A and block B both
// append a child to the SAME parent menu doc, and both call `planMenuOps` against the
// same pre-batch snapshot, each computes its own `menuItems: [...original, childX]` /
// `[...original, childY]` — two independent ops for the same key. Whichever
// `batch.set(parentRef, fields, {merge:true})` lands LAST wins for every field it
// touches, so the other block's child is silently dropped (no error, no log).
//
// The fix: fold each planned op's fields back into `existing` before planning the NEXT
// top-level spec — across blocks, AND across a single block's own top-level `menu`
// entries. `planMenuOps(specs, tenantId, existing)` is fully evaluated (it returns an
// array) before any caller-side mutation of `existing` happens, and it recurses through
// every spec it is given against that ONE snapshot — so passing it a whole block's
// `menu` array in one call is exactly as stale-snapshot-prone as calling it once per
// block was: two top-level specs in the SAME block that reference the same parent key
// would still each compute their own `menuItems` against the pre-block snapshot, and the
// shallow merge below would keep only the LAST one, silently losing the first child.
// (Caught in review: `menu: [parent('childX'), parent('childY')]` on one block used to
// yield `menuItems: ['childY']`.)
//
// The actual fix is therefore per TOP-LEVEL SPEC, not per block: call `planMenuOps` with
// a single-spec array each time, and fold its ops into `existing` before the next spec —
// whether that next spec belongs to the same block or the next one. Every later
// `planMenuOps` call then sees the accumulated state, so `missingChildren`/
// `structuralDrift` are computed relative to what will actually be in Firestore once
// earlier ops have applied — not the stale original snapshot. Ops for the same key are
// additionally folded into ONE op (latest value per field wins), which is both provably
// correct (see task-8 report) and reduces the write-op count that BUG 2 has to fit under
// the batch limit.
// ────────────────────────────────────────────────────────────────────────────────────
export function planMenuOpsForBlocks(
  blocks: FeatureBlock[],
  tenantId: string,
  existingByName: Map<string, MenuItemModel>,
): MenuOp[] {
  const accumulatedFields = new Map<string, Partial<MenuItemModel>>();
  const opKind = new Map<string, MenuOp['op']>();
  // Real Firestore doc id per key — same for every touch of a given key within one run
  // (derived from the same `existingByName` entry, or `spec.key` for a doc this run just
  // created), so simply overwriting on each touch is correct.
  const docIdByKey = new Map<string, string>();

  for (const block of blocks) {
    for (const spec of block.menu) {
      // ONE top-level spec per `planMenuOps` call — see the comment above for why.
      for (const op of planMenuOps([spec], tenantId, existingByName)) {
        const priorFull = existingByName.get(op.key) ?? ({ okey: op.docId } as MenuItemModel);
        existingByName.set(op.key, { ...priorFull, ...op.fields });

        accumulatedFields.set(op.key, { ...(accumulatedFields.get(op.key) ?? {}), ...op.fields });
        docIdByKey.set(op.key, op.docId);
        // Sticky 'create': once a key has been recorded as 'create', a later touch in
        // this same run must not downgrade it, even though that later touch's OWN
        // `planMenuOps` result (computed against the now-updated `existing`, where the
        // doc already "exists") correctly reports itself as 'update-structure'.
        if (opKind.get(op.key) !== 'create') opKind.set(op.key, op.op);
      }
    }
  }

  return [...accumulatedFields.entries()].map(([key, fields]) => ({
    key,
    docId: docIdByKey.get(key) ?? key,
    op: opKind.get(key) ?? 'update-structure',
    fields,
  }));
}

// ────────────────────────────────────────────────────────────────────────────────────
// BUG 2 FIX — Firestore batch limits.
//
// A `WriteBatch` caps at 500 operations. With ~29 blocks (Tasks 12-18), each contributing
// several menu ops, seed docs, and a `featureEvents` entry per transition, a full
// selection can exceed that comfortably. Chunking necessarily breaks atomicity across the
// WHOLE call — a crash between chunk N and N+1 leaves a partially-applied selection.
//
// This is deliberately safe to re-run to convergence:
//  - the config+events chunk is committed FIRST and alone. It is the only write in the
//    whole operation that is NOT naturally idempotent (menu ops recompute from live
//    Firestore state every call; seed docs are only written if absent) — a straight
//    diff-and-log would re-emit "enable"/"disable" featureEvents for transitions already
//    recorded if `enabledFeatures` had not yet been persisted. Committing it first and
//    alone means: once it lands, a retry recomputes `previous == plan.enabled` (zero new
//    diff) and emits nothing more — no duplicate audit entries. If it does NOT land, nothing
//    downstream depended on it, so a full retry redoes it correctly.
//  - every later chunk (menu ops, seed docs) is naturally idempotent: re-running plans
//    against whatever Firestore already has, so a retry after a partial failure converges
//    on the same end state instead of duplicating or corrupting it.
// ────────────────────────────────────────────────────────────────────────────────────
export function chunk<T>(items: readonly T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface FeatureTransition {
  block: string;
  op: 'enable' | 'disable';
}

/** Pure: which blocks flipped on/off relative to what was previously persisted. */
export function computeTransitions(previous: string[], enabled: string[]): FeatureTransition[] {
  return [
    ...enabled.filter(id => !previous.includes(id)).map((id): FeatureTransition => ({ block: id, op: 'enable' })),
    ...previous.filter(id => !enabled.includes(id)).map((id): FeatureTransition => ({ block: id, op: 'disable' })),
  ];
}

export interface PendingWrite {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
  merge: boolean;
}

export async function commitChunked(db: Firestore, writes: PendingWrite[]): Promise<void> {
  for (const part of chunk(writes)) {
    if (part.length === 0) continue;
    const batch: WriteBatch = db.batch();
    for (const w of part) batch.set(w.ref, w.data, { merge: w.merge });
    await batch.commit();
  }
}

// ────────────────────────────────────────────────────────────────────────────────────
// ROOT MENU ATTACHMENT (task-8 review round 2, repo-owner ruling) — every enabled block's
// TOP-LEVEL menu key(s) must appear in the tenant's own root doc, `menuItems/main_<tenantId>`
// (doc id == `name`). The LOAD-BEARING resolution rule (verified by reading the code, not
// assumed) is `apps/scs-app/src/app/okr-root.ts:235` — `mainMenuName` is a computed
// signal that resolves to `main_` + the current tenant id, fed into
// `<okr-menu [menuName]>` → `MenuStore.setMenuName` →
// `MenuService.read(name)` → `findByKey(this.list(), name, 'name')`
// (`libs/cms/menu/data-access/src/lib/menu.service.ts:44-47`) — a plain equality lookup
// by `name`, with NO fallback to a shared `'main'` doc. (`menu-graph.store.ts:311-314`'s
// `items.find(...) ?? items.find(i => i.name === 'main' && ...)` fallback is the CMS
// ADMIN graph-view tool only, not the app's actual render path — round-2 review correctly
// flagged that citing it as load-bearing overstated the evidence; corrected here.) Since
// nothing falls back, writing to any doc id other than `main_<tenantId>` for this tenant
// would simply never render — so this function only ever targets that exact doc.
//
// Without this attachment, a block's whole menu subtree can be correctly created/updated
// by `planMenuOpsForBlocks` above and STILL render nowhere, because nothing walks up from
// the root to discover it (task-8 report, "Defect 3"). `FeatureBlock` deliberately does
// NOT get a `parentKey` — the ownership direction is the opposite: a shared CHILD doc's
// own `tenants[]` is what a tenant "inherits" a subtree through, the root doc is the one
// thing that is genuinely per-tenant and never shared (verified against live Firestore:
// `main_bko`/`main_test` each have `tenants` = exactly their own single tenant id, while
// child keys like `misc-menu`/`cms`/`aoc-menu`/`help`/`version` recur across all of them).
//
// Unlike the additive shared-parent merges above, this is an ARRAY REPLACEMENT: a
// tenant's root `menuItems[]` is their own hand-curated order (verified: `main_bko` has
// 10 hand-ordered entries, `main_test` 16, neither alphabetical nor catalogue-ordered),
// so this must never reorder or drop an existing entry — only append newly-enabled
// blocks' keys at the end, and remove newly-disabled blocks' keys, leaving everything
// else exactly where it was.
//
// Idempotency / chunk placement: computed from the SAME `existing` snapshot read once at
// the top of `applySelection` (root doc, if present, is just another `MenuItemCollection`
// doc, so it is already in that Map — no extra read). ADDS are safe under retry because
// `addKeys` is the FULL desired set (every enabled block's keys) — a key that already
// landed is already present in `current` and is filtered out of `missing`, so it is not
// re-appended. REMOVES must be equally full-state-derived, not delta-derived — see the
// call site in `applySelection` for why (review round 2, Important 1: deriving removals
// from `computeTransitions`'s delta broke convergence when chunk 0, which persists
// `enabledFeatures`, commits but this op's own write then fails and is retried — the
// retry recomputes `previous == plan.enabled`, so the delta is empty and a genuinely
// disabled block's key would stick forever). With BOTH adds and removes derived from full
// state, this converges exactly like every other op in `menuWrites` does regardless of
// which write in the whole call failed and was retried, so it belongs in the SAME
// idempotent, safe-to-retry chunk (1..N), not the non-idempotent chunk 0.
//
// Race safety is NO WORSE than the shared-parent ops above: both compute a full
// replacement array from a live read and `set(..., {merge:true})` it — a genuinely
// concurrent editor of the SAME array field can still race either kind of op equally.
// CONSIDERED (round 2 review) and NOT adopted: `FieldValue.arrayUnion`/`arrayRemove` for
// atomic, no-read, server-side transforms — they would remove this residual race for the
// root doc specifically. Not used because (a) Firestore rejects two field transforms on
// the SAME field in one write ("Cannot apply multiple field transforms on the same
// field"), so a call that both adds and removes keys would need TWO separate document
// writes instead of one, which does not fit this chunk cleanly (the whole point of
// `menuWrites` is one `{menuItems: <value>}` write per doc per chunk pass); (b) it would
// only close the race for THIS doc while leaving the identical race open on every
// shared-parent doc `planMenuOpsForBlocks` touches — an inconsistent, undocumented
// improvement over the rest of the file, not asked for by this task; (c) the computed
// full-state replacement above already fully resolves the CONVERGENCE bug (Important 1),
// which was the actually-reported failure — it does not need atomic transforms to do
// that, only to close a race this task was never asked to close. If a future task adds
// real concurrency protection, it should cover the shared-parent ops and this one
// together, not this one alone.
// ────────────────────────────────────────────────────────────────────────────────────

// `nestedMenuKeys`, `planRootMenuOp` and `rootNavKeys` moved to `@okr/tenant-util`
// (`root-menu.util.ts`) so the feature picker can compute the SAME root-menu op client-side
// and show the admin exactly which rows a save removes or re-appends, instead of a second
// implementation that could drift from this one. Re-exported here so this module's public
// surface — and its spec — are unchanged.
export { nestedMenuKeys, planRootMenuOp, rootNavKeys } from '@okr/tenant-util';


// ────────────────────────────────────────────────────────────────────────────────────
// ROOT NAV FILTER (task 12 review round 2) — only a `navigate` or `sub` top-level spec
// belongs in a tenant's root nav. `context` (context-menu wrappers, attached via the
// `:contextMenuName` route param, never from a nav tree — they carry `url: ''`/`label: ''`)
// and `call`/`toggle` (toolbar actions, not navigable destinations) top-level specs must
// never reach `addKeys`/`removeKeys`. Before this fix, `addKeys` was every top-level key
// with no filter at all: a bundle with 9 context wrappers + 1 stray top-level `call` entry
// (task 12's `core` bundle, pre-fix) would have appended 10 blank rows to a tenant's root
// nav on the very next `applyFeatureSelection` call. `navigate` survives (e.g. `login`/
// `logout`, both top-level `navigate` specs that genuinely belong in the root nav); `sub`
// survives too — a shared-parent wrapper like `cms-menu`/`aoc-menu` (see `cmsMenuParent`/
// `aocMenuParent` in `feature-blocks.ts`) is ITSELF a real root nav entry, even though its
// CHILDREN must not also be (and never were — `addKeys`/`removeKeys` only ever look at a
// block's TOP-LEVEL specs, never recursing into `children`).

/**
 * The Firestore-touching half. Takes `catalogue`/`db` as explicit parameters rather than
 * importing them — see `createApplyFeatureSelection` below and the task-8 report for why.
 */
export async function applySelection(
  db: Firestore,
  catalogue: FeatureBlock[],
  plan: SelectionPlan,
  tenantId: string,
  uid: string,
): Promise<{ applied: string[] }> {
  const enabledBlocks = plan.enabled
    .map(id => catalogue.find(b => b.id === id))
    .filter((b): b is FeatureBlock => b !== undefined);

  // --- read the current menu snapshot (global collection, indexed by NAME) -----------
  // The read stays UNSCOPED on purpose. Menu docs are globally shared and a tenant inherits
  // a subtree by having its id appended to `tenants[]`; a read filtered on
  // `tenants array-contains tenantId` could not see the very document it is supposed to
  // extend, so the seed would create a duplicate instead of extending. That is the core
  // mechanism, not an oversight.
  //
  // Indexed by `name`, not doc id — see `indexMenuDocsByName`'s doc comment (task 12
  // review round 2): the runtime already resolves menu docs by name, and eleven live docs
  // carry legacy autoids that differ from their name.
  //
  // NAME COLLISIONS (task B-1). The pre-fix code refused to run if ANY two docs anywhere in
  // this collection shared a name. Three such pairs exist in production, so the guard fired
  // unconditionally and no tenant could ever be seeded. Two of the three are not even
  // defects: `resource-menu`/`resource-menu-scs` is the legitimate generic-plus-bespoke
  // override pattern, and both are active. The guard's premise was too coarse rather than
  // wrong — `MenuService.read` is TENANT-SCOPED, so name uniqueness is only ever required
  // WITHIN one tenant. `indexMenuDocsByName` therefore resolves each name for THIS tenant
  // (archived docs out, then the doc the tenant already inherits, then the generic
  // `id === name` doc) and reports only what it genuinely could not decide.
  //
  // The refusal is then scoped to the names THIS run writes: every menu spec name of every
  // enabled block, children included, plus the tenant's own root doc. An ambiguity anywhere
  // else in this shared collection cannot affect what this run writes and must not block
  // it — that is precisely how one stale twin under `event-menu` (a tenant-bespoke name no
  // catalogue block touches) killed seeding for every tenant.
  const menuSnap = await db.collection(MenuItemCollection).get();
  const { byName: existing, ambiguous } = indexMenuDocsByName(
    menuSnap.docs.map(d => ({ id: d.id, data: d.data() as Partial<MenuItemModel> })),
    tenantId,
  );
  const touched = new Set<string>([
    ...enabledBlocks.flatMap(b => menuSpecNames(b.menu)),
    `main_${tenantId}`, // planRootMenuOp reads this one straight out of `existing`
  ]);
  const blocking = ambiguous.filter(a => touched.has(a.name));
  if (blocking.length > 0) {
    throw new HttpsError('failed-precondition',
      `${CF_NAME}: menuItems name(s) needed by this selection cannot be resolved to a ` +
      `single document for tenant '${tenantId}', refusing to apply — ` +
      blocking.map(a => `'${a.name}' (candidates: ${a.ids.join(', ')})`).join('; '));
  }

  const menuOps = planMenuOpsForBlocks(enabledBlocks, tenantId, existing);

  // --- seed docs (create-if-absent; never rewritten once present) -------------------
  const seedWrites: PendingWrite[] = [];
  const applied: string[] = [];
  for (const block of enabledBlocks) {
    for (const seed of block.seed ?? []) {
      const ref = db.collection(seed.collection).doc(seed.okey);
      if (!(await ref.get()).exists) {
        seedWrites.push({ ref, data: seed.data, merge: false });
      }
    }
    applied.push(block.id);
  }

  // --- enablement + audit trail (chunk 0 — see BUG 2 FIX above) ----------------------
  const configRef = db.collection(AppConfigCollection).doc(tenantId);
  const configSnap = await configRef.get();
  // Legacy doc with no `enabledFeatures` field: per D-BB-10 (see effectiveFeatures() in
  // @okr/tenant-util) this reads as "every non-internal block", not as "nothing enabled" —
  // otherwise a legacy tenant's FIRST applyFeatureSelection call would log a bogus
  // "enable" event for every block it already had, cluttering an audit trail meant to
  // record real transitions only.
  const previous: string[] = configSnap.data()?.enabledFeatures
    ?? catalogue.filter(b => b.defaultAvailability !== 'internal').map(b => b.id);

  const transitions = computeTransitions(previous, plan.enabled);
  const at = getTodayStr(DateFormat.StoreDateTime);

  const configAndEventWrites: PendingWrite[] = [
    { ref: configRef, data: { enabledFeatures: plan.enabled }, merge: true },
    ...transitions.map((t): PendingWrite => ({
      ref: db.collection(FeatureEventCollection).doc(),
      data: { tenantId, block: t.block, op: t.op, at, by: uid },
      merge: false,
    })),
  ];

  await commitChunked(db, configAndEventWrites);

  // --- root menu attachment — see the long comment on planRootMenuOp above -----------
  // `removeKeys` MUST be derived from the FULL catalogue state (every block NOT in
  // `plan.enabled`), not from `transitions`' delta (review round 2, Important 1). The
  // delta is relative to `previous`, which was read from `enabledFeatures` BEFORE chunk 0
  // (just above) persisted `plan.enabled` as the new `enabledFeatures` — so a retry after
  // chunk 0 landed but this write failed re-reads `previous == plan.enabled`, computes an
  // EMPTY delta, and would silently stop removing a block's key forever. Deriving from
  // full state instead makes this call idempotent from ANY retry point, exactly like the
  // shared-parent ops: it always recomputes "every currently-disabled block's keys must
  // be absent" from scratch, regardless of what happened on a previous attempt.
  //
  // Accepted trade-off: a tenant admin who hand-adds a root menu entry whose key happens
  // to collide with a catalogue block that has NEVER been enabled will have that entry
  // silently stripped on every future `applyFeatureSelection` call for that tenant (it
  // used to only be at risk during the specific call that disabled the colliding block,
  // and would stick after one manual re-add). This is deliberate: correctness of the
  // kill-switch/disable path — a disabled block's key must not survive a retry — matters
  // more than an unlikely, self-inflicted key collision recovering on its own.
  const enabledIds = new Set(plan.enabled);
  // `rootNavKeys` filters to `navigate`/`sub` top-level specs only — see its doc comment
  // above. `removeKeys` deliberately stays UNFILTERED: a disabled block's context-wrapper/
  // call keys were never added to the root nav by a post-fix `addKeys`, so removing them
  // is a harmless no-op for a correctly-provisioned tenant, and self-heals any tenant that
  // picked up a stray entry from a pre-fix `applyFeatureSelection` run.
  const addKeys = rootNavKeys(enabledBlocks);
  const removeKeys = catalogue
    .filter(b => !enabledIds.has(b.id))
    .flatMap(b => b.menu.map(s => s.key));
  const rootOp = planRootMenuOp(tenantId, existing, addKeys, removeKeys);

  // --- menu + seed writes (chunks 1..N — naturally idempotent, safe to re-run) -------
  const menuWrites: PendingWrite[] = [
    ...menuOps.map(op => ({
      ref: db.collection(MenuItemCollection).doc(op.docId),
      data: op.fields,
      merge: true,
    })),
    ...(rootOp ? [{ ref: db.collection(MenuItemCollection).doc(rootOp.docId), data: rootOp.fields, merge: true }] : []),
  ];
  await commitChunked(db, [...menuWrites, ...seedWrites]);

  return { applied };
}

// ────────────────────────────────────────────────────────────────────────────────────
// The single server-side write path for a tenant's feature selection (D-BB-9).
//
// Takes `catalogue: FeatureBlock[]` as an explicit parameter rather than importing it,
// because the catalogue used to be one array (`FEATURE_CATALOGUE` in `@okr/tenant-feature`)
// that also named feature libs via lazy `loadComponent` imports AND eagerly imported
// `isAdminGuard`/`isAuthenticatedGuard` from `@okr/auth-feature` to populate `canActivate`.
// `@okr/auth-feature` imports `@angular/core` (`inject`) and `@okr/shared-feature`'s
// `AppStore` (an NgRx Signal Store) — confirmed empirically (twice) that importing that
// combined array here grew `dist/apps/functions/main.cjs` from 3.9MB to 15MB and shipped
// live `@angular/core` symbols into the Node runtime.
//
// RESOLVED (task 8b, repo owner ruling 2026-08-02): the catalogue is split by
// Angular-dependence. Pure metadata (id, dependsOn, bundle, menu specs, seed specs — zero
// Angular imports) lives in `@okr/tenant-util`'s `FEATURE_BLOCKS`, which this app CAN
// import and does — see `./index.ts`, which wires
// `createApplyFeatureSelection(FEATURE_BLOCKS)`. The Angular route table (`canActivate`
// guards, `loadComponent`) lives in `@okr/tenant-routes`'s `FEATURE_ROUTES`, joined to
// `FEATURE_BLOCKS` by block `id`; `feature-catalogue.sync.spec.ts` in that lib fails CI if
// the two ever drift apart. `applySelection`/`planSelection` below never call `.routes()`,
// so the metadata-only array is sufficient for everything this file does.
// ────────────────────────────────────────────────────────────────────────────────────
export function createApplyFeatureSelection(catalogue: FeatureBlock[]) {
  return onCall(
    { region: REGION, enforceAppCheck: true, cors: true },
    async (request: CallableRequest): Promise<ApplyFeatureSelectionResult> => {
      checkAppCheckToken(request, CF_NAME);
      checkAuthentication(request, CF_NAME);

      const tenantId = request.data?.tenantId;
      if (typeof tenantId !== 'string' || tenantId.trim() === '') {
        throw new HttpsError('invalid-argument', 'applyFeatureSelection requires a tenantId.');
      }
      const blockIds: string[] = Array.isArray(request.data?.blockIds) ? request.data.blockIds : [];

      const db = getFirestore();
      // `checkAuthentication` above throws if `request.auth` is missing, but that is an
      // external call TS cannot use to narrow `request.auth` here — the `?? ''` fallback
      // it would otherwise take is a trap: `db.collection(...).doc('')` throws a raw
      // Firestore INVALID_ARGUMENT instead of the intended `unauthenticated`, so if the
      // guard above is ever loosened this fails with a confusing `internal` error
      // instead of the correct one. Fail loudly and explicitly instead of coalescing.
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError('unauthenticated', 'applyFeatureSelection requires an authenticated caller.');
      }

      // --- authorisation: admin OF this tenant, not admin of some other tenant ------
      // v1 scope only — no cross-tenant/operator branch (no operator role exists yet).
      // Deliberately NOT `checkAdminRole` (@okr/shared-util-functions): that helper checks
      // `roles.admin` globally (plus a legacy custom-claim bypass) but has no notion of
      // WHICH tenant the caller administers — reusing it here would let any admin of any
      // tenant apply a feature selection to every other tenant. One read of the caller's
      // own `users/{uid}` doc gets both the role and the tenant membership in one shot.
      const userSnap = await db.collection(UserCollection).doc(uid).get();
      if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'No user document for the caller.');
      }
      const roles = (userSnap.data()?.['roles'] ?? {}) as Record<string, boolean>;
      if (roles['admin'] !== true) {
        throw new HttpsError('permission-denied',
          'Nur Administratoren können die Feature-Auswahl ändern.');
      }
      const callerTenants: string[] = userSnap.data()?.['tenants'] ?? [];
      if (!callerTenants.includes(tenantId)) {
        throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
      }

      // --- plan ------------------------------------------------------------------
      const rolloutSnap = await db.collection(FeatureRolloutCollection).get();
      const rollouts = rolloutSnap.docs.map(d => ({ okey: d.id, ...d.data() }) as FeatureRollout);
      const plan = planSelection(catalogue, rollouts, blockIds, tenantId);

      // --- apply -------------------------------------------------------------------
      const { applied } = await applySelection(db, catalogue, plan, tenantId, uid);

      logger.info(`${CF_NAME}: tenant=${tenantId} enabled=${plan.enabled.length} withheld=${plan.withheld.length}`);
      return { enabled: plan.enabled, withheld: plan.withheld, applied };
    },
  );
}
