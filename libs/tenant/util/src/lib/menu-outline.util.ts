import type { RoleName } from '@okr/shared-models';
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
 * Local copy of `@okr/cms-menu-util`'s `resolveMenuLabelKey`/`expandMenuTokens` (bare-label
 * scoping only — `menuOutlineOf` never needs `@REPO_URL@`/`@TID@`, see the doc comment below).
 *
 * NOT imported from `@okr/cms-menu-util` on purpose: that lib's barrel also re-exports
 * `menu.util.ts` (`@angular/router`, `@capacitor/browser`) and `menu-i18n.ts` (`@angular/core`)
 * as runtime — not type-only — imports. `export *` forces Node/vitest to evaluate every
 * re-exported module to link the barrel, so importing even one Angular-free symbol from it
 * pulls the whole Angular/Capacitor/Ionic chain into `tenant-util`'s module graph — exactly the
 * class of problem `feature-catalogue.types.ts` documents and `ee31f0f7f` split the catalogue
 * to avoid. `menu-outline.util.spec.ts` asserts this stays behaviourally identical to the
 * canonical resolver.
 */
function resolveOutlineLabelKey(label: string): string {
  if (!label.startsWith('@')) return label;
  const body = label.substring(1);
  const head = body.split('.', 1)[0];
  return head.includes('/') ? label : '@cms/menu/feature.' + body;
}

/**
 * A block's `menu` specs flattened depth-first, so the picker can answer the one question a
 * checkbox alone cannot: WHICH menu entries and routes does this toggle switch on?
 *
 * Reads the catalogue, not the live `menuItems` documents: the point is what the block
 * OWNS. Where a live doc has drifted from that, the drift section at the top of the screen is
 * what says so.
 *
 * Bare-label scoping only, no dynamic-token expansion (`@VERSION@`/`@REPO_URL@`/`@TID@`) — no
 * catalogue label carries one (the version row's label is a bare string, see
 * `feature-blocks.ts`), and the picker has no business resolving a running app version, repo
 * url or tenant id to render a structural outline.
 */
export function menuOutlineOf(block: FeatureBlock): MenuOutlineRow[] {
  const rows: MenuOutlineRow[] = [];
  const walk = (specs: MenuSpec[], depth: number): void => {
    for (const spec of specs) {
      rows.push({
        depth, key: spec.key, name: spec.name, url: spec.url, action: spec.action,
        roleNeeded: spec.roleNeeded, labelKey: resolveOutlineLabelKey(spec.label),
      });
      if (spec.children && spec.children.length > 0) walk(spec.children, depth + 1);
    }
  };
  walk(block.menu, 0);
  return rows;
}
