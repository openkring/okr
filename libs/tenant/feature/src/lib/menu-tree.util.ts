import type { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock, MenuSpec, MenuStructureDrift, StructuralField } from '@okr/tenant-util';

/**
 * Where a row of the segment-2 table stands relative to the catalogue, in the precedence the
 * brief fixes: a row with no owning block is always `tenant-authored` regardless of anything
 * else about it; only then does `pinned` vs. `drifted` vs. `equal` come into play.
 */
export type RowState = 'equal' | 'drifted' | 'pinned' | 'absent' | 'tenant-authored';

export interface MenuTreeRow {
  name: string;
  docId: string;          // '' when the row is `absent`
  depth: number;
  state: RowState;
  roleNeededLive: string; // '' when absent
  roleNeededCatalogue: string;
  otherDrift: string[];   // 'url' | 'action' that also differ — rendered as a ≠ badge
  blockId: string;        // '' for tenant-authored rows
  forked: boolean;
}

/**
 * THE LIVE MENU TREE FOR SEGMENT 2 — a flat, depth-annotated row list a table renders directly,
 * built by walking the tenant's real `main_<tenantId>` document tree and folding in every
 * catalogue row the tenant is missing.
 *
 * Two passes, not one:
 *
 *  1. A depth-first walk of `existing` from `rootKey` (below the root itself, exactly like
 *     `nestedMenuKeys`/`planRootMenuOp` in `@okr/tenant-util`'s `root-menu.util.ts`) produces
 *     the LIVE rows, with the same visited-set cycle guard — menu data is user-editable, and
 *     A -> B -> A is one bad save away.
 *  2. For every catalogue spec (from `enabledBlocks` only — a disabled block's menu is not
 *     something the tenant is "missing") whose name never turned up in that walk, an `absent`
 *     row is appended under its catalogue parent: right after that parent's own live subtree
 *     when the parent IS in the live tree, or at depth 0 under the root when it is not.
 *
 * `visited` is shared across both passes and serves double duty: it is the cycle guard for
 * pass 1, and "already accounted for" for pass 2 — a name found live anywhere in the tree
 * (even nested somewhere other than its catalogue-expected parent) is not reported as absent
 * a second time.
 */
export function buildMenuTree(input: {
  rootKey: string;
  existing: Map<string, MenuItemModel>;
  drift: MenuStructureDrift[];
  enabledBlocks: FeatureBlock[];
}): MenuTreeRow[] {
  const { rootKey, existing, drift, enabledBlocks } = input;

  const driftByName = new Map(drift.map(d => [d.name, d]));

  // Catalogue structural index, built once: parent name ('' = top-level, directly under the
  // root) -> its spec children; plus the first block that declares a name and the spec itself
  // (for the catalogue-side field values an `equal`/`absent` row still needs to display).
  const childrenByParent = new Map<string, MenuSpec[]>();
  const blockIdBySpecName = new Map<string, string>();
  const specByName = new Map<string, MenuSpec>();
  const indexSpecs = (specs: MenuSpec[], parentKey: string, blockId: string): void => {
    const list = childrenByParent.get(parentKey) ?? [];
    childrenByParent.set(parentKey, list);
    for (const spec of specs) {
      list.push(spec);
      if (!blockIdBySpecName.has(spec.name)) blockIdBySpecName.set(spec.name, blockId);
      if (!specByName.has(spec.name)) specByName.set(spec.name, spec);
      if (spec.children && spec.children.length > 0) indexSpecs(spec.children, spec.name, blockId);
    }
  };
  for (const block of enabledBlocks) indexSpecs(block.menu, '', block.id);

  const visited = new Set<string>([rootKey]);

  const makeLiveRow = (name: string, depth: number): MenuTreeRow => {
    const item = existing.get(name) as MenuItemModel;
    const ownerBlockId = blockIdBySpecName.get(name);
    const forked = (item.forkedFrom ?? '').length > 0;
    const liveRoleNeeded = String(item.roleNeeded ?? '');

    if (!ownerBlockId) {
      // No block declares this name — nothing the catalogue does can drift it, so it is
      // `tenant-authored` unconditionally (first in the precedence order).
      return {
        name, docId: item.okey, depth, state: 'tenant-authored',
        roleNeededLive: liveRoleNeeded, roleNeededCatalogue: '',
        otherDrift: [], blockId: '', forked,
      };
    }

    const driftEntry = driftByName.get(name);
    const pinned: StructuralField[] = driftEntry?.pinned ?? [];
    const diffFields = driftEntry ? (Object.keys(driftEntry.fields) as StructuralField[]) : [];
    const nonPinnedDiff = diffFields.filter(f => !pinned.includes(f));

    // DECISION (pinned + drifted on the same row, e.g. `roleNeeded` pinned but `url` also
    // drifting): `pinned` wins ONLY when every differing field is pinned. `pinned` reads to
    // the admin as "this difference is deliberate, nothing to do" — showing it for a row that
    // ALSO has a genuine, unintentional divergence would hide that divergence from view. So a
    // single non-pinned differing field keeps the row `drifted`, and `otherDrift` (the ≠
    // badge) reports only the non-pinned url/action divergences — a pinned field is not a
    // "drift" to flag, by the same logic that keeps a fully-pinned row out of `drifted`.
    const state: RowState =
      diffFields.length === 0 ? 'equal' : nonPinnedDiff.length === 0 ? 'pinned' : 'drifted';

    const spec = specByName.get(name);
    const roleNeededLive = driftEntry && 'roleNeeded' in driftEntry.live
      ? String(driftEntry.live.roleNeeded) : liveRoleNeeded;
    const roleNeededCatalogue = driftEntry && 'roleNeeded' in driftEntry.fields
      ? String(driftEntry.fields.roleNeeded)
      : String(spec?.roleNeeded ?? item.roleNeeded ?? '');
    const otherDrift = nonPinnedDiff.filter((f): f is 'url' | 'action' => f !== 'roleNeeded');

    return {
      name, docId: item.okey, depth, state,
      roleNeededLive, roleNeededCatalogue, otherDrift, blockId: ownerBlockId, forked,
    };
  };

  const makeAbsentRow = (spec: MenuSpec, depth: number): MenuTreeRow => ({
    name: spec.name, docId: '', depth, state: 'absent',
    roleNeededLive: '', roleNeededCatalogue: spec.roleNeeded,
    otherDrift: [], blockId: blockIdBySpecName.get(spec.name) ?? '', forked: false,
  });

  // Pass 2, factored so both the root and every live node can call it: the catalogue children
  // of `parentKey` that never showed up live. `parentIsLive` decides the depth rule — nested
  // one level under a live parent, or flattened to depth 0 under the root when the parent
  // itself is missing (or is the root). An absent node's OWN children are, by construction,
  // unreachable through it either, so they cascade to depth 0 too (`parentIsLive: false`),
  // not one level under their equally-absent parent.
  const buildAbsent = (parentKey: string, parentDepth: number, parentIsLive: boolean): MenuTreeRow[] => {
    const specs = childrenByParent.get(parentKey) ?? [];
    const out: MenuTreeRow[] = [];
    for (const spec of specs) {
      if (visited.has(spec.name)) continue; // live somewhere else in the tree — not absent
      visited.add(spec.name);
      const depth = parentIsLive ? parentDepth + 1 : 0;
      out.push(makeAbsentRow(spec, depth));
      out.push(...buildAbsent(spec.name, depth, false));
    }
    return out;
  };

  const buildLive = (name: string, depth: number): MenuTreeRow[] => {
    visited.add(name);
    const row = makeLiveRow(name, depth);
    const childRows: MenuTreeRow[] = [];
    for (const childName of existing.get(name)?.menuItems ?? []) {
      if (visited.has(childName)) continue; // cycle guard
      if (existing.has(childName)) childRows.push(...buildLive(childName, depth + 1));
      else visited.add(childName); // dangling reference — no doc to render, nothing to show
    }
    childRows.push(...buildAbsent(name, depth, true));
    return [row, ...childRows];
  };

  const rows: MenuTreeRow[] = [];
  for (const childName of existing.get(rootKey)?.menuItems ?? []) {
    if (visited.has(childName)) continue;
    if (existing.has(childName)) rows.push(...buildLive(childName, 0));
    else visited.add(childName);
  }
  rows.push(...buildAbsent('', -1, false));
  return rows;
}
