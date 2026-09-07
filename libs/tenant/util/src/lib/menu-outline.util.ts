import type { RoleName } from '@okr/shared-models';
import { resolveMenuLabelKey } from '@okr/cms-menu-util';
import type { FeatureBlock, MenuSpec } from './feature-catalogue.types';

/** One row of a block's menu subtree, flattened for display in the picker. */
export interface MenuOutlineRow {
  /** Nesting level in the block's `menu` tree — 0 for a top-level (root-nav) entry. */
  depth: number;
  key: string;
  name: string;
  /** '' for a `sub` node, which is a container and navigates nowhere. */
  url: string;
  action: MenuSpec['action'];
  roleNeeded: RoleName;
  /**
   * The key to hand to `TranslatePipe` — the spec's raw `label` run through the SAME
   * `resolveMenuLabelKey` the rendered menu uses, so the picker shows the very wording the
   * admin sees in the sidebar rather than a bare `@item.…` key.
   */
  labelKey: string;
}

/**
 * A block's `menu` specs flattened depth-first, so the picker can answer the one question a
 * checkbox alone cannot: WHICH menu entries and routes does this toggle switch on?
 *
 * Reads the catalogue, not the live `menuItems` documents: the point is what the block
 * OWNS. Where a live doc has drifted from that, the drift section at the top of the screen is
 * what says so.
 *
 * `version: ''` in the token context is deliberate — no catalogue label carries `@VERSION@`
 * (the version row's label is a bare string, see `feature-blocks.ts`), and the picker has no
 * business resolving a running app version to render a structural outline.
 */
export function menuOutlineOf(block: FeatureBlock): MenuOutlineRow[] {
  const rows: MenuOutlineRow[] = [];
  const walk = (specs: MenuSpec[], depth: number): void => {
    for (const spec of specs) {
      rows.push({
        depth, key: spec.key, name: spec.name, url: spec.url, action: spec.action,
        roleNeeded: spec.roleNeeded, labelKey: resolveMenuLabelKey(spec.label, { version: '' }),
      });
      if (spec.children && spec.children.length > 0) walk(spec.children, depth + 1);
    }
  };
  walk(block.menu, 0);
  return rows;
}
