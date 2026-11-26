import { MenuItemModel } from '@okr/shared-models';

import { isMenuBlocked, nextVisitedKeys } from './menu-cycle.util';

/** The actions a search result can have: rows that lead somewhere when selected. */
export const MENU_SEARCH_ACTIONS: readonly string[] = ['navigate', 'browse'];

/** At most this many results are listed; a longer list is no help in a sidebar. */
export const MAX_MENU_SEARCH_RESULTS = 30;

/** One row the main-menu search can find. */
export interface MenuSearchRow {
  item: MenuItemModel;
  /** `name`s of the `sub` rows between the root and this row, outermost first (the root itself is not included). */
  ancestors: string[];
}

/**
 * Lower case, no diacritics, single spaces: «Rückmeldung» and «ruckmeldung» compare equal, so the
 * search forgives a missing umlaut or accent in any of the five languages.
 */
export function normalizeMenuSearchText(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every row below `rootKey` that the search can offer: a `navigate` or `browse` row that `canSee`
 * accepts, reached only through rows `canSee` accepts (a hidden `sub` hides its children too). Tree
 * order; a row that is reachable twice is listed once, at its first place. The walk uses the same
 * cycle and depth guard as the rendered menu.
 */
export function collectMenuSearchRows(
  rootKey: string, items: MenuItemModel[], canSee: (item: MenuItemModel) => boolean,
): MenuSearchRow[] {
  const byName = new Map(items.map(i => [i.name, i]));
  const rows: MenuSearchRow[] = [];
  const seen = new Set<string>();

  const walk = (name: string, visited: ReadonlySet<string>, depth: number, ancestors: string[]): void => {
    const item = byName.get(name);
    if (!item) return;
    const nextVisited = nextVisitedKeys(visited, name);
    for (const childName of item.menuItems ?? []) {
      if (isMenuBlocked(nextVisited, childName, depth + 1)) continue;
      const child = byName.get(childName);
      if (!child || !canSee(child)) continue;
      if (MENU_SEARCH_ACTIONS.includes(child.action) && !seen.has(childName)) {
        seen.add(childName);
        rows.push({ item: child, ancestors });
      }
      if (child.action === 'sub') walk(childName, nextVisited, depth + 1, [...ancestors, childName]);
    }
  };
  walk(rootKey, new Set(), 0, []);
  return rows;
}

/**
 * The text a row is matched against: its stored `index` (name, action, key and, since the search,
 * ` nn:<nickName>`), the `nickName` itself (a legacy doc saved before the search has it in no index
 * yet) and the label as translated into the current language. Translations are never stored.
 */
export function menuSearchText(item: MenuItemModel, translatedLabel: string): string {
  return normalizeMenuSearchText([item.index, item.nickName, translatedLabel].filter(Boolean).join(' '));
}

/**
 * The rows whose search text contains every word of `term` (partial match, any order). An empty
 * term finds nothing. `textOf` returns the search text of a row, see `menuSearchText`.
 */
export function filterMenuSearchRows(
  rows: MenuSearchRow[], term: string, textOf: (row: MenuSearchRow) => string,
  max = MAX_MENU_SEARCH_RESULTS,
): MenuSearchRow[] {
  const words = normalizeMenuSearchText(term).split(' ').filter(w => w.length > 0);
  if (words.length === 0) return [];
  const result: MenuSearchRow[] = [];
  for (const row of rows) {
    const text = textOf(row);
    if (words.every(w => text.includes(w))) {
      result.push(row);
      if (result.length >= max) break;
    }
  }
  return result;
}
