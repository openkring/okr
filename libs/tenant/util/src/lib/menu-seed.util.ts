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
  ids: string[];
}

export interface MenuNameIndex {
  /** Live `menuItems` docs keyed by their `name` field (not doc id) — see the module
   * doc comment on `indexMenuDocsByName` for why. */
  byName: Map<string, MenuItemModel>;
  /** Every `name` shared by more than one live doc. Non-empty means the index is NOT
   * trustworthy for those names — the caller must refuse to proceed rather than silently
   * pick one (repo owner ruling, task 12 review round 2). */
  duplicates: MenuNameCollision[];
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
 * function must not paper over by silently picking one — `duplicates` reports it instead;
 * `byName` still contains ONE of the colliding docs (first-seen, arbitrary) purely so a
 * caller that ignores `duplicates` fails loudly downstream rather than crashing here, but
 * the intended caller contract is: check `duplicates` first and refuse to proceed if
 * non-empty (see `applySelection` in `apps/functions/src/tenant/apply-feature-selection.ts`).
 */
export function indexMenuDocsByName(
  docs: { id: string; data: Partial<MenuItemModel> }[],
): MenuNameIndex {
  const byName = new Map<string, MenuItemModel>();
  const idsByName = new Map<string, string[]>();

  for (const { id, data } of docs) {
    const name = (data.name as string | undefined) ?? id;
    idsByName.set(name, [...(idsByName.get(name) ?? []), id]);
    if (!byName.has(name)) {
      byName.set(name, { okey: id, tenants: [] as string[], ...data } as MenuItemModel);
    }
  }

  const duplicates: MenuNameCollision[] = [...idsByName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids }));

  return { byName, duplicates };
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
