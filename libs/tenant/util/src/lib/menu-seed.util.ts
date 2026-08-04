import type { MenuItemModel } from '@okr/shared-models';
import type { MenuSpec } from './feature-catalogue.types';

/**
 * Catalogue-owned fields. Rewritten on every seed so a shipped url or role fix reaches
 * existing tenants. Everything else (label, icon, index, description) belongs to the
 * tenant and is written only when the document is created (D-BB-7).
 */
export const STRUCTURAL_FIELDS = ['url', 'action', 'roleNeeded'] as const;

export interface MenuOp {
  /** `spec.name` (== `spec.key` per the catalogue invariant) — identity used for
   * map/accumulation bookkeeping (`planMenuOpsForBlocks`'s shared-parent fold) and for
   * matching a parent's `menuItems[]` child references. NOT necessarily the Firestore
   * document id to write to — see `docId`. */
  key: string;
  /** The REAL Firestore document id to write to: an existing doc's own `okey` if one was
   * found (by name — see `indexMenuDocsByName`), otherwise `spec.key` (===`name`) for a
   * freshly created doc. Eleven live `menuItems` docs carry legacy autoids that differ
   * from their `name` (task 12 review round 2: `icon-all`'s real doc id is
   * `ogwzpl15fpuhcxon5e7b`, etc.) — `key` alone is not a safe write target. */
  docId: string;
  op: 'create' | 'add-tenant' | 'update-structure';
  fields: Partial<MenuItemModel>;
}

export interface MenuNameCollision {
  name: string;
  /** The doc ids that SURVIVED the resolution ladder and are therefore still tied — not
   * every doc that shares the name. An archived twin, or a twin the ladder deselected, is
   * deliberately absent: it is not a candidate and naming it in an error would send the
   * reader after the wrong document. */
  ids: string[];
}

export interface MenuNameIndex {
  /** Live `menuItems` docs keyed by their `name` field (not doc id) — see the module
   * doc comment on `indexMenuDocsByName` for why. One entry per name, already resolved
   * for the requested tenant. A name whose only live docs are all archived is ABSENT (see
   * step 1 of the ladder), which puts it on `planMenuOps`' create path. */
  byName: Map<string, MenuItemModel>;
  /** Every `name` the ladder could NOT narrow to a single document for this tenant. The
   * caller must refuse to proceed — but ONLY for the names its own run actually writes
   * (see `menuSpecNames` and `applySelection`): a genuinely ambiguous name elsewhere in
   * this globally-shared collection is somebody else's data problem, not a reason to
   * block every tenant's seeding forever. */
  ambiguous: MenuNameCollision[];
}

/**
 * Every `name` a set of menu specs writes to, including nested children — the exact set of
 * names a seeding run must be able to resolve unambiguously. Used by `applySelection` to
 * scope the ambiguity refusal to the names it actually touches.
 */
export function menuSpecNames(specs: MenuSpec[]): string[] {
  return specs.flatMap(s => [s.name, ...menuSpecNames(s.children ?? [])]);
}

/**
 * Narrow the live documents sharing one `name` down to the single one a seed for
 * `tenantId` should write to. Returns 0 (nothing live to extend → create path), 1
 * (resolved), or ≥2 (genuinely ambiguous for this tenant) candidates.
 *
 * The ladder, in order, and why each rung exists — all three rungs are load-bearing against
 * documents that exist in production today (verified directly against Firestore 2026-08-04,
 * 358 `menuItems` docs, exactly three colliding names):
 *
 *  1. ARCHIVED DOCS ARE NOT CANDIDATES. `MenuService.list`/`.read` query through
 *     `getSystemQuery`, which issues `where('isArchived', '==', false)`
 *     (`libs/shared/util-core/src/lib/query.util.ts`) — an archived doc is invisible at
 *     runtime, so seeding it would write structural fixes into a document no app will ever
 *     render. Live case: `menuItems/filter-toggle` (`isArchived: true`, a stale `action:
 *     'call'` version) vs `menuItems/zjbhk84hfrfc32yb6td5` (`isArchived: false`, the real
 *     `action: 'toggle'` one carrying `labelAlt`/`iconAlt`). Only strictly `=== true` is
 *     excluded: a doc MISSING the field is equally invisible to that Firestore query, but
 *     dropping it here would send the seed down the create path and write a SECOND doc
 *     under that name — making the collision worse rather than better. Missing `isArchived`
 *     is a data defect to repair, not one to route around.
 *  2. One candidate left → done.
 *  3. PREFER A DOC THIS TENANT ALREADY INHERITS. Menu docs are globally shared and a tenant
 *     inherits a subtree by having its id in `tenants[]`, so an existing membership is the
 *     strongest possible statement of which doc is *this* tenant's. Live case: `name:
 *     'resource-menu'` is carried by `menuItems/resource-menu` (`tenants: ['test']`, 9
 *     children) AND `menuItems/resource-menu-scs` (`tenants: ['scs']`, a 6-child bespoke
 *     reshaping). `scs` must extend the bespoke one; `test` must extend the generic one.
 *  4. PREFER THE GENERIC DOC (`id === name`). The tie-break for a tenant that inherits
 *     neither — and for twins nobody has claimed. A tenant-bespoke variant's id carries a
 *     tenant suffix (`resource-menu-scs`) and a stale twin gets an unrelated id
 *     (`info_menu`, byte-identical to `menuItems/event-menu`, both `name: 'event-menu'`,
 *     both `tenants: ['test']`), so `id === name` picks the document that is canonical for
 *     everyone. Applied INSIDE rung 3's survivors, never over the whole set: if two docs
 *     both name this tenant, the answer must come from among those two.
 *
 * Rungs 3 and 4 can point at different documents (for `scs`, rung 3 says
 * `resource-menu-scs` and rung 4 would say `resource-menu`) — that is the point, and rung 3
 * deliberately wins. Rung 4 only ever runs on a set rung 3 could not decide.
 */
function resolveCandidates(
  name: string,
  group: { id: string; data: Partial<MenuItemModel> }[],
  tenantId: string,
): { id: string; data: Partial<MenuItemModel> }[] {
  const active = group.filter(d => d.data.isArchived !== true); // 1
  if (active.length <= 1) return active;                        // 2

  const scoped = active.filter(d => (d.data.tenants ?? []).includes(tenantId)); // 3
  const narrowed = scoped.length > 0 ? scoped : active;
  if (narrowed.length === 1) return narrowed;

  const generic = narrowed.filter(d => d.id === name); // 4 — doc ids are unique, so ≤ 1
  return generic.length === 1 ? generic : narrowed;
}

/**
 * Index live `menuItems` Firestore docs by their `name` FIELD, not their doc id.
 *
 * The runtime already resolves menu documents by name — `MenuService.read(name)` →
 * `findByKey(this.list(), name, 'name')` (`libs/cms/menu/data-access/src/lib/
 * menu.service.ts`) — and parent docs reference their children by `name` in their own
 * `menuItems[]` array. The Firestore doc id is very nearly irrelevant at runtime; eleven
 * live docs carry legacy autoids that differ from their `name` (verified: `icon-all` is
 * really `ogwzpl15fpuhcxon5e7b`, `c-icon` is `t9c9p9uecgqcmeitz8ak`, and similarly for
 * `icon-add`, `icon-sync`, `icon-export-raw`, `print`, `user-exportusers`,
 * `location-show`, `priv-register`, `priv-audit`, and `editmode-toggle`, really
 * `cp-toggle-editmode`). Indexing by doc id (the pre-fix behaviour) made `planMenuOps`
 * blind to all eleven: `existing.get('icon-sync')` missed, `planMenuOps` planned a
 * `create`, and a SECOND `menuItems/icon-sync` doc would be written on every seed —
 * `MenuService.read` would then non-deterministically resolve whichever Firestore lists
 * first, and the eleven originals (some carrying fields `MenuSpec` cannot even express,
 * e.g. `cp-toggle-editmode`'s `labelAlt`/`iconAlt`) would never receive another
 * structural-drift update again.
 *
 * A NAME COLLISION (two live docs sharing one `name`) is a data-integrity problem this
 * function must not paper over by blindly picking one. It is resolved instead, per TENANT,
 * by the ladder in `resolveCandidates` above — archived docs out, then the doc this tenant
 * already inherits, then the generic (`id === name`) doc. `MenuService.read` is itself
 * tenant-scoped, so name uniqueness is only ever required WITHIN a tenant; a global
 * uniqueness demand (the pre-fix behaviour) refuses to seed anybody because of a collision
 * that no single tenant can even observe. Whatever the ladder cannot decide is reported in
 * `ambiguous` and the caller refuses — but only for the names its own run writes; see
 * `MenuNameIndex.ambiguous` and `applySelection`.
 *
 * `byName` still holds one arbitrary survivor for an `ambiguous` name, purely so a caller
 * that ignores `ambiguous` fails loudly downstream rather than crashing here.
 */
export function indexMenuDocsByName(
  docs: { id: string; data: Partial<MenuItemModel> }[],
  tenantId: string,
): MenuNameIndex {
  const groups = new Map<string, { id: string; data: Partial<MenuItemModel> }[]>();
  for (const doc of docs) {
    const name = (doc.data.name as string | undefined) ?? doc.id;
    groups.set(name, [...(groups.get(name) ?? []), doc]);
  }

  const byName = new Map<string, MenuItemModel>();
  const ambiguous: MenuNameCollision[] = [];

  for (const [name, group] of groups) {
    const candidates = resolveCandidates(name, group, tenantId);
    if (candidates.length > 1) ambiguous.push({ name, ids: candidates.map(d => d.id) });

    const winner = candidates[0];
    if (!winner) continue; // every doc of this name is archived → create path
    // `okey` spread LAST, after `data`: a stored doc that happens to carry its own
    // `okey` field (the convention is to strip it before write, but nothing enforces
    // that on read) must never override the REAL Firestore doc id — `docId` is a write
    // target downstream (`applySelection`), so a wrong `okey` here would silently
    // redirect a write to the wrong document (task 12 review round 3).
    byName.set(name, { tenants: [] as string[], ...winner.data, okey: winner.id } as MenuItemModel);
  }

  return { byName, ambiguous };
}

/**
 * Mirrors `getMenuIndex` (`libs/cms/menu/util/src/lib/menu.util.ts:32-34`:
 * `'n:' + name + ' a:' + action + ' k:' + okey`), which every UI create/update path
 * (`MenuService.create`/`update`) sets on write. Duplicated rather than imported: this is
 * `type:util` in the `tenant` domain and `@okr/cms-menu-util` is a different domain —
 * importing it here for a 3-concatenation string is not worth the cross-domain coupling.
 * If the two ever need to change together, that is a signal to extract a shared helper.
 */
function menuIndex(name: string, action: string, okey: string): string {
  return `n:${name} a:${action} k:${okey}`;
}

function structuralDrift(existing: MenuItemModel, spec: MenuSpec): Partial<MenuItemModel> {
  const drift: Partial<MenuItemModel> = {};
  for (const field of STRUCTURAL_FIELDS) {
    if (existing[field as keyof MenuItemModel] !== spec[field as keyof MenuSpec]) {
      drift[field as keyof MenuItemModel] = spec[field as keyof MenuSpec] as never;
    }
  }
  return drift;
}

/**
 * Plan the writes that seed one block's menu subtree for a tenant. Pure: it reads the
 * current documents and returns operations, so the caller decides how to apply them.
 *
 * Children are appended to a parent's `menuItems[]` and never reordered or removed —
 * a tenant's ordering survives every future seed.
 *
 * `existingByName` MUST be indexed by `name`, not doc id — see `indexMenuDocsByName`'s doc
 * comment. Looking a spec up by anything else (e.g. `spec.key` used to double as a doc-id
 * lookup key before task 12 review round 2) is blind to the eleven legacy-autoid docs and
 * creates a duplicate on every seed.
 */
export function planMenuOps(
  specs: MenuSpec[],
  tenantId: string,
  existingByName: Map<string, MenuItemModel>,
): MenuOp[] {
  const ops: MenuOp[] = [];

  const visit = (spec: MenuSpec): void => {
    const doc = existingByName.get(spec.name);

    if (!doc) {
      ops.push({
        key: spec.name,
        docId: spec.key, // spec.key === spec.name (invariant); explicit for clarity at the write site
        op: 'create',
        fields: {
          okey: spec.key, name: spec.name, url: spec.url, action: spec.action,
          roleNeeded: spec.roleNeeded, icon: spec.icon, label: spec.label,
          tenants: [tenantId],
          menuItems: (spec.children ?? []).map(c => c.key),
          // Both REQUIRED for the doc to actually render, not just for shape/search
          // consistency (task-8 review round 3, Important 3): `MenuService.list()` /
          // `.read()` query via `getSystemQuery`, which issues
          // `where('isArchived', '==', false)` (`libs/shared/util-core/src/lib/
          // query.util.ts:11-16`). Firestore's `==` filter excludes documents that are
          // MISSING the field entirely — it does not default a missing field to `false`.
          // Without this, every child doc this function creates is invisible to the app
          // (`MenuService.read(name)` → `undefined` → `<okr-menu>` renders nothing),
          // silently defeating the whole menu-seeding system on every brand-new key.
          isArchived: false,
          index: menuIndex(spec.name, spec.action, spec.key),
        },
      });
    } else {
      const fields: Partial<MenuItemModel> = structuralDrift(doc, spec);

      const missingChildren = (spec.children ?? [])
        .map(c => c.key)
        .filter(k => !(doc.menuItems ?? []).includes(k));
      if (missingChildren.length > 0) {
        fields.menuItems = [...(doc.menuItems ?? []), ...missingChildren];
      }

      const needsTenant = !(doc.tenants ?? []).includes(tenantId);
      if (needsTenant) fields.tenants = [...(doc.tenants ?? []), tenantId];

      if (needsTenant || Object.keys(fields).length > 0) {
        ops.push({
          key: spec.name, docId: doc.okey,
          op: needsTenant ? 'add-tenant' : 'update-structure', fields,
        });
      }
    }

    (spec.children ?? []).forEach(visit);
  };

  specs.forEach(visit);
  return ops;
}
