/**
 * Helpers that protect the recursive `<bk-menu>` renderer against circular menu
 * references (Menu A → Menu B → Menu A) and runaway nesting depth.
 */

/** Hard cap on menu nesting depth, regardless of cycle status (defensive limit). */
export const MAX_MENU_DEPTH = 8;

/**
 * Whether a child menu must be rendered as a placeholder rather than recursed into:
 * true when the child has already appeared on the current path (a cycle) or the depth
 * cap is reached.
 */
export function isMenuBlocked(visitedKeys: ReadonlySet<string>, childName: string, depth: number): boolean {
  return depth >= MAX_MENU_DEPTH || visitedKeys.has(childName);
}

/** The visited-keys set to hand to child menus: the current path plus this menu's name. */
export function nextVisitedKeys(visitedKeys: ReadonlySet<string>, name: string): Set<string> {
  return new Set([...visitedKeys, name]);
}
