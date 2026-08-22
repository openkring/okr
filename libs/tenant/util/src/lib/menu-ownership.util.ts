import type { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock } from './feature-catalogue.types';
import { FEATURE_BLOCKS } from './feature-blocks';
import { blockOwnersOfMenuKey } from './feature-routes.util';

/**
 * WHO OWNS THIS MENU DOCUMENT — the single classifier behind every "are you sure?" and every
 * ownership badge in the menu UI.
 *
 * Navigation is data, and most of that data is written by the feature catalogue rather than by
 * the admin editing it. Three of the four write paths can therefore damage something the admin
 * cannot see from the row in front of them:
 *
 *   1. `MenuService.update()` copy-on-writes a SHARED doc (`<name>_<tenantId>`) and detaches this
 *      tenant from the original. Silent. Afterwards catalogue structural fixes no longer arrive.
 *   2. Saving the feature picker rewrites `main_<tenantId>.menuItems` from the catalogue.
 *   3. «Struktur übernehmen» replays catalogue `url`/`action`/`roleNeeded` over hand-tuning.
 *
 * Every one of those needs the same question answered — is this row the catalogue's or mine? —
 * so it is answered in exactly ONE place. A badge that disagreed with the dialog that follows it
 * would be worse than no badge at all.
 *
 * WHY THIS LIVES IN `tenant-util` AND NOT IN `cms-menu-util`, where the rest of the menu helpers
 * are: the question is a CATALOGUE question. `FEATURE_BLOCKS` and `blockOwnersOfMenuKey` are both
 * here, and `MenuItemModel` is already imported here by `menu-seed.util.ts` — so this home adds
 * no new lib edge in either direction, while the other one would make `cms-menu-util` depend on
 * the catalogue.
 */
export type MenuOwnershipKind =
  /** No block declares this key — the admin wrote it. Nothing the catalogue does can touch it. */
  | 'tenant-owned'
  /** Declared by ≥1 block and still the catalogue's document (possibly shared with other tenants). */
  | 'catalogue-shared'
  /** Declared by ≥1 block, but already copy-on-written for this tenant — drifting from the catalogue. */
  | 'catalogue-forked';

export interface MenuOwnership {
  kind: MenuOwnershipKind;
  /** EVERY block declaring this key, not just the first — see `blockOwnersOfMenuKey`. */
  owners: string[];
  /** True when the next `MenuService.update()` on this doc would copy-on-write it. */
  willFork: boolean;
  /** The doc id a fork would create. Only set when `willFork` is true. */
  forkTargetKey?: string;
  /** The shared doc this one was forked from, when it already is a fork. */
  forkedFrom?: string;
}

/** The doc id `MenuService.fork()` would create. Kept here so the warning cannot drift from it. */
export function forkTargetKey(menuItem: MenuItemModel, tenantId: string): string {
  return `${menuItem.name}_${tenantId}`;
}

/** Does any block in the catalogue declare this menu key (at any nesting depth)? */
export function isCatalogueOwned(key: string, catalogue: FeatureBlock[] = FEATURE_BLOCKS): boolean {
  return blockOwnersOfMenuKey(catalogue, key).length > 0;
}

export function classifyMenuOwnership(
  menuItem: MenuItemModel,
  tenantId: string,
  catalogue: FeatureBlock[] = FEATURE_BLOCKS,
): MenuOwnership {
  const owners = blockOwnersOfMenuKey(catalogue, menuItem.name);
  const forkedFrom = (menuItem.forkedFrom ?? '').length > 0 ? menuItem.forkedFrom : undefined;

  // Mirrors `MenuService.update()` exactly: fork only when the doc is shared with someone ELSE
  // *and* this tenant is on it. A doc scoped to other tenants only is not forked either — there
  // is nothing to detach, so a copy would leave two resolvable docs for one name.
  const others = menuItem.tenants.filter(t => t !== tenantId);
  const willFork = others.length > 0 && menuItem.tenants.includes(tenantId);

  const kind: MenuOwnershipKind =
    owners.length === 0 ? 'tenant-owned' : forkedFrom ? 'catalogue-forked' : 'catalogue-shared';

  return {
    kind,
    owners,
    willFork,
    ...(willFork ? { forkTargetKey: forkTargetKey(menuItem, tenantId) } : {}),
    ...(forkedFrom ? { forkedFrom } : {}),
  };
}
