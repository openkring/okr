import type { MenuItemModel } from '@okr/shared-models';

/**
 * Whether a menu node renders, given the per-row gates (`rowVisible`: hidden keys, missing books, owning
 * feature block) — plus ONE structural rule: a `sub` (accordion) none of whose children would render is
 * hidden too. An empty accordion is a dead row; it appears whenever every child of a shared parent belongs to
 * a block the tenant does not run (finance split, 2026-11-10: «Finanzen» for a tenant without Spesen and
 * Kostenrechnung) and when a tenant has no books (every `@BOOKS@` row hidden).
 *
 * - A `sub` with no children at all is hidden.
 * - A child name with no document in `byName` counts as VISIBLE: the menu renders the «Missing:» placeholder
 *   for it, which an admin must still see to repair the reference.
 * - Recursion follows nested `sub`s; a cycle (A → B → A) counts as visible here — `isMenuBlocked` renders
 *   the placeholder for it, this function must only terminate.
 */
export function isMenuNodeVisible(
  key: string,
  byName: (name: string) => MenuItemModel | undefined,
  rowVisible: (key: string, item: MenuItemModel | undefined) => boolean,
  visiting: ReadonlySet<string> = new Set(),
): boolean {
  const item = byName(key);
  if (!rowVisible(key, item)) return false;
  if (item?.action !== 'sub') return true;
  if (visiting.has(key)) return true;
  const children = item.menuItems ?? [];
  if (children.length === 0) return false;
  const next = new Set(visiting).add(key);
  return children.some(child => !byName(child) || isMenuNodeVisible(child, byName, rowVisible, next));
}
