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
  /** The live document's `action` (the catalogue spec's when absent) — drives the type filter. */
  action: string;
  /**
   * This row plus every `absent` row in its own subtree — the argument for a single
   * «Ins Menü» that attaches a page together with its context menu and that menu's actions
   * (the "small feature" grouping). Empty when there is nothing left to add, which is what
   * decides whether the row offers a button at all.
   */
  groupKeys: string[];
}

/**
 * THE LIVE MENU TREE FOR SEGMENT 2 — a flat, depth-annotated row list a table renders directly.
 *
 * IDENTITY, NOT REACHABILITY. A row is "in the menu" when this tenant HAS the document, not
 * when the document happens to hang below `main_<tenantId>`. That distinction is the whole
 * point of this pass: a CONTEXT menu is never a child of the root menu — it is resolved from
 * a page url's last segment (`calevent-all.url = '/calevent/all/c-calevents'`) — and neither
 * are its `call`/`toggle` children. Deriving the state from a root walk alone reported every
 * one of them as `absent`, so the table offered «Ins Menü» on documents the tenant already
 * had; the server then correctly planned nothing and answered "es gibt nichts zu übernehmen".
 * The row was lying, not the server.
 *
 * The converse failed too: a child NAME listed by a live parent whose own document this tenant
 * does not inherit (`cms-menu` lists `menu-all`, but `menu-all.tenants` has no `kwa`) is what
 * `<okr-menu>` renders as a yellow «Missing: menu-all». The old pass marked such a name
 * visited as a "dangling reference" and emitted NO row for it, so the one screen that could
 * repair it never showed it. It is now exactly what `absent` means, and it gets the button.
 *
 * So: walk from the root, and wherever a name is reached — through a parent's `menuItems`, or
 * through the catalogue's own structure — emit a LIVE row if `existing` has the document and
 * an ABSENT row if it does not. `visited` is both the cycle guard (menu data is user-editable
 * and A → B → A is one bad save away) and "already accounted for", so a name that turns up in
 * two places is reported once.
 *
 * GROUPING: a `context` spec named by a `navigate` spec's url is re-parented under that
 * navigate spec, so a page, its context menu and that menu's actions read as one small
 * feature instead of as unrelated top-level rows. `groupKeys` then lets one click add the
 * whole group.
 */
export function buildMenuTree(input: {
  rootKey: string;
  existing: Map<string, MenuItemModel>;
  drift: MenuStructureDrift[];
  enabledBlocks: FeatureBlock[];
}): MenuTreeRow[] {
  const { rootKey, existing, drift, enabledBlocks } = input;

  const driftByName = new Map(drift.map(d => [d.name, d]));

  // ── Catalogue index ────────────────────────────────────────────────────────────────────
  // parent name ('' = top-level, directly under the root) -> its spec children; plus the first
  // block that declares a name and the spec itself (for the catalogue-side field values an
  // `equal`/`absent` row still needs to display).
  const childrenByParent = new Map<string, MenuSpec[]>();
  const blockIdBySpecName = new Map<string, string>();
  const specByName = new Map<string, MenuSpec>();
  const declaredParent = new Map<string, string>();

  const indexSpecs = (specs: MenuSpec[], parentKey: string, blockId: string): void => {
    for (const spec of specs) {
      if (!blockIdBySpecName.has(spec.name)) blockIdBySpecName.set(spec.name, blockId);
      if (!specByName.has(spec.name)) {
        specByName.set(spec.name, spec);
        declaredParent.set(spec.name, parentKey);
      }
      if (spec.children && spec.children.length > 0) indexSpecs(spec.children, spec.name, blockId);
    }
  };
  for (const block of enabledBlocks) indexSpecs(block.menu, '', block.id);

  /**
   * The context menu a `navigate` row opens, by the only link the data gives us: the last
   * segment of its url (`/private/{pageId}/{contextMenuName}`, `/calevent/all/c-calevents`)
   * — the same regex shape `MenuGraphStore.extractContextMenuName` uses for the sitemap.
   * Only a name that really is a `context` spec counts, so an ordinary trailing url segment
   * ('all', 'my') re-parents nothing.
   */
  const contextParentOf = new Map<string, string>();
  for (const spec of specByName.values()) {
    if (spec.action !== 'navigate') continue;
    const last = spec.url.split('?')[0].split('/').filter(Boolean).pop();
    if (!last) continue;
    const target = specByName.get(last);
    if (!target || target.action !== 'context' || contextParentOf.has(last)) continue;
    contextParentOf.set(last, spec.name);
  }

  for (const [name, spec] of specByName) {
    const parent = contextParentOf.get(name) ?? declaredParent.get(name) ?? '';
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), spec]);
  }

  // ── Row factories ──────────────────────────────────────────────────────────────────────
  const makeLiveRow = (name: string, item: MenuItemModel, depth: number): MenuTreeRow => {
    const ownerBlockId = blockIdBySpecName.get(name);
    const forked = (item.forkedFrom ?? '').length > 0;
    const liveRoleNeeded = String(item.roleNeeded ?? '');
    const action = String(item.action ?? specByName.get(name)?.action ?? '');

    if (!ownerBlockId) {
      // No block declares this name — nothing the catalogue does can drift it, so it is
      // `tenant-authored` unconditionally (first in the precedence order).
      return {
        name, docId: item.okey, depth, state: 'tenant-authored',
        roleNeededLive: liveRoleNeeded, roleNeededCatalogue: '',
        otherDrift: [], blockId: '', forked, action, groupKeys: [],
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
      action, groupKeys: [],
    };
  };

  const makeAbsentRow = (spec: MenuSpec, depth: number): MenuTreeRow => ({
    name: spec.name, docId: '', depth, state: 'absent',
    roleNeededLive: '', roleNeededCatalogue: spec.roleNeeded,
    otherDrift: [], blockId: blockIdBySpecName.get(spec.name) ?? '', forked: false,
    action: spec.action, groupKeys: [],
  });

  // ── The walk ───────────────────────────────────────────────────────────────────────────
  const visited = new Set<string>([rootKey]);
  const rows: MenuTreeRow[] = [];

  const emit = (name: string, depth: number): void => {
    if (visited.has(name)) return;
    visited.add(name);

    const item = existing.get(name);
    if (!item) {
      // No document for this tenant. The catalogue knows what it should be -> offer it.
      // Nothing knows it -> a stray name in somebody's `menuItems`, with nothing to show
      // and nothing this screen could do about it.
      const spec = specByName.get(name);
      if (!spec) return;
      rows.push(makeAbsentRow(spec, depth));
      for (const child of childrenByParent.get(name) ?? []) emit(child.name, depth + 1);
      return;
    }

    rows.push(makeLiveRow(name, item, depth));
    // The document's own children first, in the order the tenant curated, then whatever the
    // catalogue expects below this name and the document does not list.
    for (const childName of item.menuItems ?? []) emit(childName, depth + 1);
    for (const spec of childrenByParent.get(name) ?? []) emit(spec.name, depth + 1);
  };

  for (const childName of existing.get(rootKey)?.menuItems ?? []) emit(childName, 0);
  for (const spec of childrenByParent.get('') ?? []) emit(spec.name, 0);

  // ── Grouping: what one click on this row would add ─────────────────────────────────────
  // A row's subtree is exactly the following rows with a greater depth, so the flat list is
  // its own index — no second traversal, and the group can never disagree with what the
  // table shows below the row.
  return rows.map((row, i) => {
    const groupKeys = row.state === 'absent' ? [row.name] : [];
    for (let j = i + 1; j < rows.length && rows[j].depth > row.depth; j++) {
      if (rows[j].state === 'absent') groupKeys.push(rows[j].name);
    }
    return groupKeys.length > 0 ? { ...row, groupKeys } : row;
  });
}

/**
 * The segment-2 toolbar's two filters, applied to a built tree.
 *
 * A MATCH DRAGS ITS ANCESTORS ALONG. Dropping a non-matching parent would leave its children
 * indented under nothing, so `calevent-add` would appear to sit at the top level of the menu
 * — the one thing this table exists to show correctly. Ancestors are kept for context only;
 * they are ordinary rows and keep their own actions, which is right: an admin who searched
 * for a missing action still wants the group button on the page above it.
 *
 * `action` is the `menu_action` category value; `'all'` (the `okr-cat-select` «withAll»
 * sentinel) and `''` both mean "no type filter".
 */
export function filterMenuRows(rows: MenuTreeRow[], searchTerm: string, action: string): MenuTreeRow[] {
  const term = searchTerm.trim().toLowerCase();
  const byAction = action.length > 0 && action !== 'all';
  if (term.length === 0 && !byAction) return rows;

  const matches = (row: MenuTreeRow): boolean =>
    (term.length === 0 || row.name.toLowerCase().includes(term))
    && (!byAction || row.action === action);

  // The flat list is its own tree index: `ancestors[d]` is the index of the row that opened
  // depth `d`, truncated to the current row's depth before it takes its own slot.
  const keep = new Set<number>();
  const ancestors: number[] = [];
  rows.forEach((row, i) => {
    ancestors.length = row.depth;
    ancestors[row.depth] = i;
    if (!matches(row)) return;
    for (const index of ancestors) {
      if (index !== undefined) keep.add(index);
    }
  });
  return rows.filter((_row, i) => keep.has(i));
}
