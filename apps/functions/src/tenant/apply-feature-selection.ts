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
  planMenuOps, resolveAvailability, resolveWithDeps,
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
  existing: Map<string, MenuItemModel>,
): MenuOp[] {
  const accumulatedFields = new Map<string, Partial<MenuItemModel>>();
  const opKind = new Map<string, MenuOp['op']>();

  for (const block of blocks) {
    for (const spec of block.menu) {
      // ONE top-level spec per `planMenuOps` call — see the comment above for why.
      for (const op of planMenuOps([spec], tenantId, existing)) {
        const priorFull = existing.get(op.key) ?? ({ okey: op.key } as MenuItemModel);
        existing.set(op.key, { ...priorFull, ...op.fields });

        accumulatedFields.set(op.key, { ...(accumulatedFields.get(op.key) ?? {}), ...op.fields });
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
// (doc id == `name`; resolution rule verified against `menu-graph.store.ts:311-314`'s
// `items.find(i => i.name === 'main_' + tenantId)`). Without this, a block's whole menu
// subtree can be correctly created/updated by `planMenuOpsForBlocks` above and STILL
// render nowhere, because nothing walks up from the root to discover it (task-8 report,
// "Defect 3"). `FeatureBlock` deliberately does NOT get a `parentKey` — the ownership
// direction is the opposite: a shared CHILD doc's own `tenants[]` is what a tenant
// "inherits" a subtree through, the root doc is the one thing that is genuinely
// per-tenant and never shared (verified against live Firestore: `main_scs`/`main_p13`/
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
// doc, so it is already in that Map — no extra read). A retry after a partial failure
// re-fetches `existing` fresh, so a key that already landed is already present and is not
// re-appended, and a key already removed is not "re-removed" (removing an absent key is a
// no-op) — this converges exactly like every other op in `menuWrites` does, so it belongs
// in the SAME idempotent, safe-to-retry chunk (1..N), not the non-idempotent chunk 0. Race
// safety is NO WORSE than the shared-parent ops above: both compute a full replacement
// array from a live read and `set(..., {merge:true})` it — a genuinely concurrent editor
// of the SAME array field can still race either kind of op equally; this task was not
// asked to add transactions/locking, and doing so here without doing it for the
// shared-parent ops too would be an inconsistent, undocumented improvement over them.
// ────────────────────────────────────────────────────────────────────────────────────
export function planRootMenuOp(
  tenantId: string,
  existing: Map<string, MenuItemModel>,
  addKeys: string[],
  removeKeys: string[],
): MenuOp | undefined {
  const key = `main_${tenantId}`;
  const doc = existing.get(key);
  const wantedAdds = [...new Set(addKeys)];

  if (!doc) {
    // Nothing enabled yet for a brand-new tenant with no root doc at all — nothing to
    // seed a root with (there is no menu to show), so don't create an empty shell.
    if (wantedAdds.length === 0) return undefined;
    // Field shape mirrors the real `main_bko`/`main_test` docs fetched from Firestore
    // (fields present on both: action, data, description, icon, isArchived, label,
    // menuItems, name, roleNeeded, tags, tenants, url) rather than inventing a shape.
    return {
      key,
      op: 'create',
      fields: {
        okey: key, name: key, action: 'main', url: '', label: 'main', icon: '',
        description: '', tags: '', data: [], isArchived: false,
        roleNeeded: 'none', tenants: [tenantId], menuItems: wantedAdds,
      },
    };
  }

  // Never remove a key that a still/newly-enabled block also wants — keeps its existing
  // position instead of dropping and re-appending it at the end.
  const removeSet = new Set(removeKeys.filter(k => !wantedAdds.includes(k)));
  const current = doc.menuItems ?? [];
  const kept = current.filter(k => !removeSet.has(k));
  const missing = wantedAdds.filter(k => !kept.includes(k));
  const menuItems = [...kept, ...missing];

  const arrayChanged = menuItems.length !== current.length
    || menuItems.some((k, i) => k !== current[i]);
  // Per-tenant, never shared (see header comment) — self-heal if it ever drifted, but
  // this is a no-op for every correctly-provisioned root doc.
  const tenantsCorrect = doc.tenants?.length === 1 && doc.tenants[0] === tenantId;

  if (!arrayChanged && tenantsCorrect) return undefined; // nothing to write

  const fields: Partial<MenuItemModel> = {};
  if (arrayChanged) fields.menuItems = menuItems;
  if (!tenantsCorrect) fields.tenants = [tenantId];
  return { key, op: 'update-structure', fields };
}

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

  // --- read the current menu snapshot (global collection, keyed by doc id) -----------
  const menuSnap = await db.collection(MenuItemCollection).get();
  const existing = new Map<string, MenuItemModel>(
    menuSnap.docs.map(d => [d.id, { okey: d.id, tenants: [] as string[], ...d.data() } as MenuItemModel]),
  );

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
  const disabledBlockIds = transitions.filter(t => t.op === 'disable').map(t => t.block);
  const addKeys = enabledBlocks.flatMap(b => b.menu.map(s => s.key));
  const removeKeys = disabledBlockIds
    .map(id => catalogue.find(b => b.id === id))
    .filter((b): b is FeatureBlock => b !== undefined)
    .flatMap(b => b.menu.map(s => s.key));
  const rootOp = planRootMenuOp(tenantId, existing, addKeys, removeKeys);

  // --- menu + seed writes (chunks 1..N — naturally idempotent, safe to re-run) -------
  const menuWrites: PendingWrite[] = [
    ...menuOps.map(op => ({
      ref: db.collection(MenuItemCollection).doc(op.key),
      data: op.fields,
      merge: true,
    })),
    ...(rootOp ? [{ ref: db.collection(MenuItemCollection).doc(rootOp.key), data: rootOp.fields, merge: true }] : []),
  ];
  await commitChunked(db, [...menuWrites, ...seedWrites]);

  return { applied };
}

// ────────────────────────────────────────────────────────────────────────────────────
// The single server-side write path for a tenant's feature selection (D-BB-9).
//
// NOT wired to `FEATURE_CATALOGUE` here. `FEATURE_CATALOGUE` lives in `@okr/tenant-feature`
// (HUMAN RULING A, plan progress ledger, 2026-08-02) because it names feature libs via
// lazy `loadComponent` imports — but its two current blocks (`calevent`, `aoc`) also
// import `isAdminGuard`/`isAuthenticatedGuard` from `@okr/auth-feature` EAGERLY (not
// lazily) to populate `canActivate`. `@okr/auth-feature` imports `@angular/core` (`inject`)
// and `@okr/shared-feature`'s `AppStore` (an NgRx Signal Store). Confirmed empirically:
// adding `import { FEATURE_CATALOGUE } from '@okr/tenant-feature'` to this app and
// building it grew `dist/apps/functions/main.cjs` from 3.9MB to 15MB, and the output
// contains live `@angular/core` symbols (`inject(`, the `AppStore` class) — i.e. Angular
// framework code would ship inside this Cloud Functions bundle and execute in Node,
// which is exactly the "hack around it" this task was told not to do. See the task-8
// report for the options put to the repo owner. Until that's resolved, wire this callable
// with `createApplyFeatureSelection(catalogue)` where `catalogue` comes from wherever the
// owner decides an Angular-free copy of the block data can live.
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
