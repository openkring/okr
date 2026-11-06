import { MenuItemModel } from '@okr/shared-models';
import { isMenuBlocked, nextVisitedKeys } from './menu-cycle.util';
import { MenuTokenContext, resolveMenuUrl } from './menu-tokens';

/** The main-menu row that is active for the current url, and the `sub` rows leading to it. */
export interface ActiveMenu {
  /** `name` of the active `navigate` row. */
  key: string;
  /** `name`s of the rows between the root and `key`, outermost first. The root itself is not included. */
  ancestors: string[];
}

export interface ActiveMenuInput {
  /** `name` of the menu document the walk starts from. */
  rootKey: string;
  /** Every menu document the walk may look up by `name`. */
  items: MenuItemModel[];
  /** The current url (path, optionally with query and hash). */
  path: string;
  /** Visibility gate; a row it refuses is neither a candidate nor walked into. */
  canSee: (item: MenuItemModel) => boolean;
  /** Resolves `@TID@` / `@BOOKS@` in the row urls. */
  tokenContext: MenuTokenContext;
  /** Row to highlight when the url matches no row (e.g. a detail page outside the menu). */
  lastSelectedKey?: string;
}

/**
 * Reduces a url to the part that identifies a main-menu row: no query, no hash, no trailing slash,
 * and without the `contextMenuName` segment of `/private/{id}/{menu}` and `/public/{id}/{menu}`
 * (the context menu is a view of the page, not another place; only exactly three segments carry it,
 * deeper paths are left alone). The root path becomes ''.
 */
export function normaliseMenuPath(url: string): string {
  const bare = (url ?? '').split('#')[0].split('?')[0];
  const segments = bare.split('/').filter(s => s.length > 0);
  if ((segments[0] === 'private' || segments[0] === 'public') && segments.length === 3) {
    segments.splice(2, 1);
  }
  return segments.length ? '/' + segments.join('/') : '';
}

/** Number of segments of `rowPath` when it is a whole-segment prefix of `currentPath`, else -1. */
function prefixLength(rowPath: string, currentPath: string): number {
  if (rowPath === currentPath) return rowPath.split('/').length - 1;
  // the root row ('') matches only the root itself, otherwise it would be active on every page
  if (rowPath === '' || !currentPath.startsWith(rowPath + '/')) return -1;
  return rowPath.split('/').length - 1;
}

/**
 * Decides which `navigate` row of the main menu is active for `path`: the visible row whose url is
 * the longest whole-segment prefix of the path; on a tie the row first in tree order. When no row
 * matches, `lastSelectedKey` is used if it is still a visible row.
 */
export function findActiveMenu(input: ActiveMenuInput): ActiveMenu | undefined {
  const { rootKey, items, canSee, tokenContext, lastSelectedKey } = input;
  const current = normaliseMenuPath(input.path);
  const byName = new Map(items.map(i => [i.name, i]));

  let best: ActiveMenu | undefined;
  let bestLength = -1;
  let fallback: ActiveMenu | undefined;

  const walk = (name: string, visited: ReadonlySet<string>, depth: number, ancestors: string[]): void => {
    const item = byName.get(name);
    if (!item) return;
    const nextVisited = nextVisitedKeys(visited, name);
    for (const childName of item.menuItems ?? []) {
      if (isMenuBlocked(nextVisited, childName, depth + 1)) continue;
      const child = byName.get(childName);
      if (!child || !canSee(child)) continue;
      // a navigate row without a url goes nowhere; normalised it would be '' and match the root path
      if (child.action === 'navigate' && child.url) {
        const length = prefixLength(normaliseMenuPath(resolveMenuUrl(child.url, tokenContext)), current);
        if (length > bestLength) {
          bestLength = length;
          best = { key: childName, ancestors };
        }
        if (childName === lastSelectedKey && !fallback) fallback = { key: childName, ancestors };
      }
      walk(childName, nextVisited, depth + 1, [...ancestors, childName]);
    }
  };
  walk(rootKey, new Set(), 0, []);

  return best ?? fallback;
}
