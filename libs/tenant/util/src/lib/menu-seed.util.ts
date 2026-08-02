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

function structuralDrift(existing: MenuItemModel, spec: MenuSpec): Partial<MenuItemModel> {
  const drift: Partial<MenuItemModel> = {};
  if (existing.url !== spec.url) drift.url = spec.url;
  if (existing.action !== spec.action) drift.action = spec.action;
  if (existing.roleNeeded !== spec.roleNeeded) drift.roleNeeded = spec.roleNeeded;
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

      const needsTenant = !doc.tenants.includes(tenantId);
      if (needsTenant) fields.tenants = [...doc.tenants, tenantId];

      if (needsTenant || Object.keys(fields).length > 0) {
        ops.push({ key: spec.key, op: needsTenant ? 'add-tenant' : 'update-structure', fields });
      }
    }

    (spec.children ?? []).forEach(visit);
  };

  specs.forEach(visit);
  return ops;
}
