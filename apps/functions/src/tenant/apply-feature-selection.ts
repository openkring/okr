import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';

import {
  AppConfigCollection, FeatureEventCollection, FeatureRolloutCollection,
  MenuItemCollection, UserCollection,
  type FeatureEvent, type MenuItemModel,
} from '@okr/shared-models';
import {
  blockOfMenuKey, indexMenuDocsByName, menuSpecNames, planMenuOps, planRootMenuOp,
  resolveAvailability, resolveWithDeps,
  type ApplyPlanPreview, type FeatureBlock, type FeatureRollout,
  type MenuNameCollision, type MenuOp, type MenuSpec, type PlanEntry,
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
// ROOT MENU ATTACHMENT (task-8 review round 2, repo-owner ruling) — a ticked top-level menu
// key must appear in the tenant's own root doc, `menuItems/main_<tenantId>` (doc id ==
// `name`), or the row renders nowhere. The load-bearing resolution rule is a plain equality
// lookup by `name` with NO fallback to a shared `'main'` doc: `okr-root.ts`'s `mainMenuName`
// computes `main_` + the current tenant id → `<okr-menu [menuName]>` → `MenuStore.setMenuName`
// → `MenuService.read(name)` → `findByKey(this.list(), name, 'name')`. Nothing walks up from
// the root to discover a subtree, and nothing falls back, so this is the one document that is
// genuinely per-tenant and never shared (verified live: `main_bko`/`main_test` each carry
// exactly their own tenant id, while child keys like `misc-menu`/`cms`/`help` recur across
// all of them).
//
// APPEND-ONLY (D-BB-17/18). A tenant's root `menuItems[]` is their own hand-curated order, so
// `planRootMenuOp` only ever appends a genuinely missing key at the tail — it never reorders,
// never drops, and no longer removes anything at all: switching a block off is `disableBlock`'s
// job and gate 2 (`MenuStore.isVisible`) already hides every row of a disabled block. The old
// `removeKeys` rewrite was cosmetic, and it was what turned an accidentally unticked checkbox
// into a menu change.
//
// Only a `navigate` or `sub` top-level spec is ever offered to it (see `planRowsOfBlock`):
// `context` wrappers attach via the `:contextMenuName` route param and carry `url: ''`/
// `label: ''`, and `call`/`toggle` rows are toolbar actions, not destinations — a bundle with
// nine context wrappers would otherwise append nine blank rows to the root nav.
//
// Race safety: like every shared-parent op here, this computes a full replacement array from a
// live read and `set(..., {merge:true})`s it, so a genuinely concurrent editor of the same
// array can race it. `arrayUnion` was considered and not adopted — it would close the race for
// this one document while leaving it open on every shared parent, an inconsistent improvement
// this task was not asked to make.
// ────────────────────────────────────────────────────────────────────────────────────

// `nestedMenuKeys`, `planRootMenuOp` and `rootNavKeys` live in `@okr/tenant-util`
// (`root-menu.util.ts`) so the feature picker can compute the SAME root-menu op client-side
// and show the admin exactly which rows a save appends, instead of a second implementation
// that could drift from this one. Re-exported here so this module's public surface — and its
// spec — are unchanged.
export { nestedMenuKeys, planRootMenuOp, rootNavKeys } from '@okr/tenant-util';


// ────────────────────────────────────────────────────────────────────────────────────
// THE VERBS (spec §19). One act per call: `enableBlock` switches a block on and writes
// exactly the menu rows the admin ticked; `addMenuRows` attaches rows of a block that is
// already on. Nothing is derived from a block's — or a checkbox's — ABSENCE any more.
//
// Both plan only: they return `{ writes, preview }` and commit nothing themselves, so the
// callable decides between a dry run and a real save from one and the same plan (D-BB-7c).
// ────────────────────────────────────────────────────────────────────────────────────

export interface MenuSnapshot {
  existing: Map<string, MenuItemModel>;
  ambiguous: MenuNameCollision[];
}

/**
 * The unscoped read every verb needs. Menu docs are globally shared and a tenant inherits a
 * subtree by having its id in `tenants[]`, so a query filtered on `tenants array-contains`
 * could not see the very document it must extend — it would create a duplicate instead.
 * That is the core mechanism, not an oversight, and it is also why the client cannot plan
 * this itself (D-BB-7c).
 *
 * Indexed by `name`, not doc id — see `indexMenuDocsByName`: the runtime resolves menu docs
 * by name and eleven live docs carry legacy autoids that differ from their name.
 */
export async function readMenuSnapshot(db: Firestore, tenantId: string): Promise<MenuSnapshot> {
  const snap = await db.collection(MenuItemCollection).get();
  const { byName, ambiguous } = indexMenuDocsByName(
    snap.docs.map(d => ({ id: d.id, data: d.data() as Partial<MenuItemModel> })), tenantId);
  return { existing: byName, ambiguous };
}

/**
 * Refuse only for the names THIS run writes — an ambiguity elsewhere is somebody else's
 * problem. The pre-fix guard refused on ANY collision anywhere in the shared collection,
 * which is how one stale twin under a tenant-bespoke name killed seeding for everybody.
 */
function assertResolvable(ambiguous: MenuNameCollision[], touched: Set<string>): void {
  const blocking = ambiguous.filter(a => touched.has(a.name));
  if (blocking.length > 0) {
    throw new HttpsError('failed-precondition',
      `${CF_NAME}: menuItems name(s) cannot be resolved to a single document — ` +
      blocking.map(a => `'${a.name}' (candidates: ${a.ids.join(', ')})`).join('; '));
  }
}

export interface VerbResult {
  writes: PendingWrite[];
  preview: ApplyPlanPreview;
}

/** One `featureEvents` write per transition — the append-only audit trail (D-BB-5). */
function eventWrites(
  db: Firestore,
  tenantId: string,
  uid: string,
  at: string,
  events: {
    block: string; op: FeatureEvent['op']; docId?: string; name?: string;
    field?: string; from?: string; to?: string;
  }[],
): PendingWrite[] {
  return events.map((e): PendingWrite => ({
    ref: db.collection(FeatureEventCollection).doc(),
    // Spread rather than always writing the optional keys: `menu-add` carries no
    // field/from/to, and writing them as `undefined` makes firebase-admin throw.
    data: { tenantId, at, by: uid, ...e },
    merge: false,
  }));
}

/** Seed docs of these blocks that do not exist yet — never rewritten once present. */
async function planSeedWrites(db: Firestore, blocks: FeatureBlock[]): Promise<PendingWrite[]> {
  const writes: PendingWrite[] = [];
  for (const block of blocks) {
    for (const seed of block.seed ?? []) {
      const ref = db.collection(seed.collection).doc(seed.okey);
      if (!(await ref.get()).exists) writes.push({ ref, data: seed.data, merge: false });
    }
  }
  return writes;
}

/** `{ entries: [], alsoEnabled: [], withheld: [] }` — a verb that changes nothing. */
function emptyPreview(): ApplyPlanPreview {
  return { entries: [], alsoEnabled: [], withheld: [] };
}

/**
 * Turn the planned ops into `PlanEntry` sentences — the only place prose is produced.
 *
 * Built from the SAME ops that are about to be written, never predicted a second time. There
 * is NEVER a `field-overwritten` entry here: neither verb overwrites anything (D-BB-15);
 * only `applyCatalogueValue` does, and it does not go through this planner.
 */
function buildPreview(input: {
  blockId?: string;
  alsoEnabled: { id: string; because: string }[];
  withheld: { id: string; reason: string }[];
  ops: MenuOp[];
  before: Map<string, MenuItemModel>;
  rootOp: MenuOp | undefined;
  seedWrites: PendingWrite[];
  /** When the run happens — carried for symmetry with the audit writes, not shown. */
  at: string;
}): ApplyPlanPreview {
  const entries: PlanEntry[] = [];

  if (input.blockId) {
    entries.push({
      kind: 'block-enabled', subject: input.blockId,
      consequence: 'Der Bereich steht dir und deinen Mitgliedern ab sofort zur Verfügung.',
    });
  }
  for (const dep of input.alsoEnabled) {
    entries.push({
      kind: 'block-enabled', subject: dep.id, reason: dep.because,
      consequence: 'Dieser Bereich wird mit eingeschaltet, weil der gewählte darauf aufbaut.',
    });
  }
  for (const held of input.withheld) {
    entries.push({
      kind: 'block-withheld', subject: held.id, reason: held.reason,
      consequence: 'Dieser Bereich ist für euch zurzeit nicht verfügbar und bleibt aus.',
    });
  }

  for (const op of input.ops) {
    if (op.op === 'create') {
      entries.push({
        kind: 'menu-created', subject: op.key,
        consequence: 'Dieser Menüpunkt wird neu angelegt.',
      });
      continue;
    }
    // An existing document is only ever extended: your tenant is added to it, and a parent
    // gains the children you ticked. Nothing that is already there changes.
    if (op.fields.tenants !== undefined) {
      entries.push({
        kind: 'menu-extended', subject: op.key,
        consequence: 'Dieser Menüpunkt ist bereits vorhanden und wird für euch freigeschaltet.',
      });
    } else if (op.fields.menuItems !== undefined) {
      entries.push({
        kind: 'menu-extended', subject: op.key,
        consequence: 'Dieser Menüpunkt erhält die zusätzlich gewählten Unterpunkte.',
      });
    }
    if (op.fields.isArchived === false) {
      entries.push({
        kind: 'menu-reactivated', subject: op.key,
        consequence: 'Dieser früher entfernte Menüpunkt wird wieder sichtbar.',
      });
    }
  }

  if (input.rootOp) {
    const rootKey = input.rootOp.key;
    const current = input.before.get(rootKey)?.menuItems ?? [];
    const next = (input.rootOp.fields.menuItems as string[] | undefined) ?? current;
    for (const key of next.filter(k => !current.includes(k))) {
      entries.push({
        kind: 'menu-attached', subject: key,
        consequence: 'Dieser Eintrag erscheint neu in eurem Hauptmenü.',
      });
    }
  }

  for (const write of input.seedWrites) {
    entries.push({
      kind: 'seed-created', subject: `${write.ref.parent.id}/${write.ref.id}`,
      consequence: 'Dafür wird ein Startdatensatz angelegt, den du danach anpassen kannst.',
    });
  }

  return { entries, alsoEnabled: input.alsoEnabled, withheld: input.withheld };
}

/**
 * Apply exactly the requested rows of one block. `menuKeys` is a WHITELIST: a spec whose key
 * is absent is not written, not created, not attached (D-BB-14). Children of a ticked parent
 * are only written when they are themselves ticked — the dialog offers them, so a missing
 * child means the admin unticked it.
 *
 * `existing` is MUTATED: each planned op is folded back in before the next top-level spec is
 * planned. `planMenuOps` is pure and only sees the map it is given, so two specs referencing
 * the SAME shared parent would otherwise each compute `menuItems` against the same stale
 * snapshot, and the later `set(..., {merge:true})` would silently drop the earlier child.
 * That is why this loops one top-level spec at a time instead of handing the whole array
 * over in one call — the fold has to happen BETWEEN specs, whether they belong to the same
 * block or to the next one.
 */
function planRowsOfBlock(
  block: FeatureBlock,
  tenantId: string,
  wanted: Set<string>,
  existing: Map<string, MenuItemModel>,
): { ops: MenuOp[]; attached: string[] } {
  const prune = (spec: MenuSpec): MenuSpec | undefined => {
    if (!wanted.has(spec.key)) return undefined;
    const children = (spec.children ?? []).map(prune).filter((s): s is MenuSpec => !!s);
    return { ...spec, children };
  };
  const specs = block.menu.map(prune).filter((s): s is MenuSpec => !!s);

  const ops: MenuOp[] = [];
  for (const spec of specs) {
    for (const op of planMenuOps([spec], tenantId, existing)) {
      existing.set(op.key, {
        ...(existing.get(op.key) ?? ({ okey: op.docId } as MenuItemModel)),
        ...op.fields,
      });
      ops.push({ ...op, blockId: op.blockId ?? block.id });
    }
  }

  // Only a `navigate` or `sub` top-level spec belongs in a tenant's root nav — `context`
  // wrappers attach via the `:contextMenuName` route param and carry no url/label, and
  // `call`/`toggle` rows are toolbar actions, not destinations.
  const attached = specs
    .filter(s => s.action === 'navigate' || s.action === 'sub')
    .map(s => s.key);
  return { ops, attached };
}

/** The tenant's effective enabled set, with D-BB-10's legacy fallback. */
function effectiveEnabled(
  configData: Record<string, unknown> | undefined, catalogue: FeatureBlock[],
): string[] {
  // A legacy doc with no `enabledFeatures` field reads as "every non-internal block", not
  // as "nothing enabled" — otherwise a legacy tenant's first call would log a bogus enable
  // event for every block it already had.
  return (configData?.['enabledFeatures'] as string[] | undefined)
    ?? catalogue.filter(b => b.defaultAvailability !== 'internal').map(b => b.id);
}

const menuWrite = (db: Firestore, op: MenuOp): PendingWrite => ({
  ref: db.collection(MenuItemCollection).doc(op.docId), data: op.fields, merge: true,
});

/**
 * VERB `enableBlock` — switch one block on and write exactly the rows the admin ticked.
 *
 * ADD, never replace: the new `enabledFeatures` is the old one plus this block and its
 * dependency closure. Nothing is derived from a block's absence any more — that is the
 * whole fix. Switching a block off is `disableBlock`'s job and touches no menu document.
 */
export async function planEnableBlock(
  db: Firestore,
  catalogue: FeatureBlock[],
  rollouts: FeatureRollout[],
  tenantId: string,
  uid: string,
  blockId: string,
  menuKeys: string[],
): Promise<VerbResult> {
  const requested = catalogue.find(b => b.id === blockId);
  if (!requested) throw new HttpsError('invalid-argument', `Unknown block '${blockId}'.`);

  const configRef = db.collection(AppConfigCollection).doc(tenantId);
  const configSnap = await configRef.get();
  const previous = effectiveEnabled(configSnap.data(), catalogue);

  const plan = planSelection(catalogue, rollouts, [...previous, blockId], tenantId);
  const alsoEnabled = resolveWithDeps(catalogue, [blockId])
    .filter(id => id !== blockId && !previous.includes(id))
    .map(id => ({ id, because: blockId }));

  const blocks = [requested, ...alsoEnabled.map(a => catalogue.find(b => b.id === a.id))]
    .filter((b): b is FeatureBlock => !!b);

  const { existing, ambiguous } = await readMenuSnapshot(db, tenantId);
  assertResolvable(ambiguous,
    new Set([...blocks.flatMap(b => menuSpecNames(b.menu)), `main_${tenantId}`]));
  // Snapshot BEFORE planning: `planRowsOfBlock` folds each op back into `existing`.
  const before = new Map(existing);

  const wanted = new Set(menuKeys);
  const ops: MenuOp[] = [];
  const attached: string[] = [];
  for (const block of blocks) {
    const result = planRowsOfBlock(block, tenantId, wanted, existing);
    ops.push(...result.ops);
    attached.push(...result.attached);
  }
  const rootOp = planRootMenuOp(tenantId, existing, attached);

  const at = getTodayStr(DateFormat.StoreDateTime);
  const seedWrites = await planSeedWrites(db, blocks);
  const writes: PendingWrite[] = [
    { ref: configRef, data: { enabledFeatures: plan.enabled }, merge: true },
    ...eventWrites(db, tenantId, uid, at, [
      { block: blockId, op: 'enable' as const },
      ...alsoEnabled.map(a => ({ block: a.id, op: 'enable' as const })),
    ]),
    ...ops.map(op => menuWrite(db, op)),
    ...(rootOp ? [menuWrite(db, rootOp)] : []),
    ...seedWrites,
  ];

  return {
    writes,
    preview: buildPreview({
      blockId, alsoEnabled, withheld: plan.withheld, ops, before, rootOp, seedWrites, at,
    }),
  };
}

/**
 * VERB `addMenuRows` — attach rows of a block that is ALREADY on. Same mechanics as
 * `planEnableBlock` minus the `enabledFeatures` write: a row is never a reason to switch a
 * block on behind the admin's back, so a key whose block is off is refused rather than
 * quietly enabling it.
 */
export async function planAddMenuRows(
  db: Firestore,
  catalogue: FeatureBlock[],
  tenantId: string,
  uid: string,
  keys: string[],
): Promise<VerbResult> {
  if (keys.length === 0) return { writes: [], preview: emptyPreview() };

  const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
  const enabled = new Set(effectiveEnabled(configSnap.data(), catalogue));

  // key → owning block, refusing anything this tenant may not have.
  const byBlock = new Map<string, { block: FeatureBlock; keys: string[] }>();
  for (const key of keys) {
    const owner = blockOfMenuKey(catalogue, key);
    if (!owner) {
      throw new HttpsError('invalid-argument',
        `${CF_NAME}: menu key '${key}' belongs to no catalogue block.`);
    }
    if (!enabled.has(owner)) {
      throw new HttpsError('failed-precondition',
        `${CF_NAME}: der Bereich '${owner}' ist für '${tenantId}' nicht aktiviert — ` +
        `der Menüeintrag '${key}' kann darum nicht hinzugefügt werden.`);
    }
    const block = catalogue.find(b => b.id === owner) as FeatureBlock;
    const entry = byBlock.get(owner) ?? { block, keys: [] };
    entry.keys.push(key);
    byBlock.set(owner, entry);
  }

  const { existing, ambiguous } = await readMenuSnapshot(db, tenantId);
  assertResolvable(ambiguous, new Set([...keys, `main_${tenantId}`]));
  const before = new Map(existing);

  const wanted = new Set(keys);
  const ops: MenuOp[] = [];
  const attached: string[] = [];
  for (const { block } of byBlock.values()) {
    const result = planRowsOfBlock(block, tenantId, wanted, existing);
    ops.push(...result.ops);
    attached.push(...result.attached);
  }
  const rootOp = planRootMenuOp(tenantId, existing, attached);

  const at = getTodayStr(DateFormat.StoreDateTime);
  const writes: PendingWrite[] = [
    ...eventWrites(db, tenantId, uid, at, [...byBlock.entries()].flatMap(([block, entry]) =>
      entry.keys.map(name => ({ block, op: 'menu-add' as const, name })))),
    ...ops.map(op => menuWrite(db, op)),
    ...(rootOp ? [menuWrite(db, rootOp)] : []),
  ];

  return {
    writes,
    preview: buildPreview({
      alsoEnabled: [], withheld: [], ops, before, rootOp, seedWrites: [], at,
    }),
  };
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
      // OPT-IN, and strictly `=== true` (task 1). An ordinary picker save must never rewrite
      // `url`/`action`/`roleNeeded` on documents that already exist: a save replays every
      // spec of every enabled block (225 documents for `okr`), so a hand-tuned permission on
      // a menu row unrelated to the block just ticked used to vanish with no warning and no
      // trace. Only «Katalog-Werte übernehmen» — which confirms the exact fields first — asks for
      // the replay. A missing or non-boolean field therefore means "extend only".
      const replayStructure = request.data?.replayStructure === true;
      // Same strict-`true` rule, opposite purpose: `dryRun` plans everything and writes
      // nothing, so the picker can name the consequences of a save before committing to it.
      // A typo'd or missing field must never turn a real save into a silent no-op, hence
      // `=== true` rather than a truthiness check.
      const dryRun = request.data?.dryRun === true;

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
      const { applied, preview } = await applySelection(
        db, catalogue, plan, tenantId, uid, { replayStructure, dryRun });

      logger.info(`${CF_NAME}: tenant=${tenantId} enabled=${plan.enabled.length} ` +
        `withheld=${plan.withheld.length} replayStructure=${replayStructure} dryRun=${dryRun}`);
      return { enabled: plan.enabled, withheld: plan.withheld, applied, preview };
    },
  );
}
