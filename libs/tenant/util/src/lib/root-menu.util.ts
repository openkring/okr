import type { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock } from './feature-catalogue.types';
import type { MenuOp } from './menu-seed.util';

/**
 * THE ROOT MENU PLANNER — what a feature-picker save does to `main_<tenantId>.menuItems`.
 *
 * These three functions are pure and were the Cloud Function's private business until the menu
 * guard needed them: the picker now computes the SAME op client-side before saving, so the
 * confirmation can name the exact rows that will disappear and the exact rows that will come
 * back appended at the tail. Reimplementing that in the client would guarantee the warning and
 * the write drift apart — the same argument `findStructuralDrift` records for «Struktur
 * übernehmen». There is one implementation and both callers share it.
 *
 * `apps/functions/src/tenant/apply-feature-selection.ts` re-exports all three, so its own test
 * suite (and any existing importer) keeps working unchanged.
 */

/**
 * Every menu key reachable from `rootKey` BELOW the root array — i.e. nested one or more
 * levels deep inside a `sub`/`context` parent — walking `menuItems[]` through `existing`.
 *
 * WHY THIS EXISTS. `planRootMenuOp` used to dedupe `addKeys` against the root array ALONE,
 * so a key the tenant had deliberately nested under a hand-made parent looked "missing" and
 * was appended to the root on every run. Live example (`scs`, 2026-08): `event-menu-scs`
 * already contained `calevent-all`/`task-all`/`task-my`/`invitation-all` and `sport-menu`
 * contained `logbuch`; the first picker save appended all five to the root as well, so each
 * rendered twice — once where the admin put it, once flat at the bottom. Trimming the root
 * by hand did not stick: `addKeys` is the FULL desired set, so the next run re-appended them.
 *
 * Reachability is the right test because the ONLY thing the root attachment guarantees is
 * that an enabled block is reachable from the tenant's navigation at all. A nested key
 * already satisfies that, so appending it adds nothing but a duplicate.
 *
 * `existing` is already the tenant-resolved name→doc index (`indexMenuDocsByName`), so this
 * is a pure in-memory walk — no extra read. `seen` terminates it on the cyclic menu data the
 * renderer also guards against (`isMenuBlocked`, `libs/cms/menu/util/src/lib/
 * menu-cycle.util.ts`); a visited set alone is sufficient for termination, so the renderer's
 * additional depth cap is not duplicated here.
 *
 * KNOWN GAP (accepted, not a defect): a key nested under a parent owned by a DISABLED block
 * counts as reachable here, while `MenuStore.isVisible` hides it at render time — the block
 * would be enabled but invisible. Rare (it needs a cross-block nesting the admin built by
 * hand), and «Struktur übernehmen» plus a root trim recovers it. Tighten this to "ancestor
 * chain's blocks are enabled too" only if it is ever actually observed.
 */
export function nestedMenuKeys(rootKey: string, existing: Map<string, MenuItemModel>): Set<string> {
  const nested = new Set<string>();
  const seen = new Set<string>([rootKey]);

  // Start BELOW the root: the root's own entries are `kept`/`current` in the caller and must
  // stay dedupe-able there (a key listed at root is not "nested", it is already attached).
  const queue = [...(existing.get(rootKey)?.menuItems ?? [])];

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const child of existing.get(name)?.menuItems ?? []) {
      nested.add(child);
      queue.push(child);
    }
  }
  return nested;
}

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
    // `index` matches `getMenuIndex` (`libs/cms/menu/util/src/lib/menu.util.ts:32-34`:
    // `'n:' + name + ' a:' + action + ' k:' + okey`), which every UI create/update path
    // (`MenuService.create`/`update`) sets on write — without it this doc is
    // shape-inconsistent with every other menu doc and invisible to the admin menu-list
    // search (index is a searchable field, not load-bearing for rendering).
    return {
      key,
      docId: key, // the root doc's Firestore id always equals its name (main_<tenantId>)
      op: 'create',
      fields: {
        okey: key, name: key, action: 'main', url: '', label: 'main', icon: '',
        description: '', tags: '', data: [], isArchived: false,
        index: `n:${key} a:main k:${key}`,
        roleNeeded: 'none', tenants: [tenantId], menuItems: wantedAdds,
      },
    };
  }

  // Never remove a key that a still/newly-enabled block also wants — keeps its existing
  // position instead of dropping and re-appending it at the end.
  const removeSet = new Set(removeKeys.filter(k => !wantedAdds.includes(k)));
  const current = doc.menuItems ?? [];
  const kept = current.filter(k => !removeSet.has(k));
  // Already reachable one level down under a hand-made parent → attaching it at the root
  // too would only duplicate the row. See `nestedMenuKeys`.
  const nested = nestedMenuKeys(key, existing);
  const missing = wantedAdds.filter(k => !kept.includes(k) && !nested.has(k));
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
  return { key, docId: key, op: 'update-structure', fields };
}

// ────────────────────────────────────────────────────────────────────────────────────
export function rootNavKeys(blocks: FeatureBlock[]): string[] {
  return blocks.flatMap(b => b.menu
    .filter(s => s.action === 'navigate' || s.action === 'sub')
    .map(s => s.key));
}