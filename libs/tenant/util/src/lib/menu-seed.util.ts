import type { MenuItemModel } from '@okr/shared-models';
import type { MenuSpec } from './feature-catalogue.types';

/**
 * Catalogue-owned fields. Rewritten on every seed so a shipped url or role fix reaches
 * existing tenants. Everything else (label, icon, index, description) belongs to the
 * tenant and is written only when the document is created (D-BB-7).
 */
export const STRUCTURAL_FIELDS = ['url', 'action', 'roleNeeded'] as const;

export interface MenuOp {
  key: string;
  op: 'create' | 'add-tenant' | 'update-structure';
  fields: Partial<MenuItemModel>;
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
 */
export function planMenuOps(
  specs: MenuSpec[],
  tenantId: string,
  existing: Map<string, MenuItemModel>,
): MenuOp[] {
  const ops: MenuOp[] = [];

  const visit = (spec: MenuSpec): void => {
    const doc = existing.get(spec.key);

    if (!doc) {
      ops.push({
        key: spec.key,
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
        ops.push({ key: spec.key, op: needsTenant ? 'add-tenant' : 'update-structure', fields });
      }
    }

    (spec.children ?? []).forEach(visit);
  };

  specs.forEach(visit);
  return ops;
}
