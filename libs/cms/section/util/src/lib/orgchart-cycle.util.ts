/**
 * Helpers that protect the recursive `<okr-orgchart-node>` renderer against circular
 * group hierarchies (Group A → Group B → Group A, or a group that is its own parent)
 * and runaway nesting depth.
 */

/** Hard cap on orgchart nesting depth, regardless of cycle status (defensive limit). */
export const MAX_ORGCHART_DEPTH = 12;

/**
 * Whether a child group must be rendered as a placeholder rather than recursed into:
 * true when the child has already appeared on the current path (a cycle) or the depth
 * cap is reached.
 */
export function isOrgchartBlocked(visitedKeys: ReadonlySet<string>, childKey: string, depth: number): boolean {
  return depth >= MAX_ORGCHART_DEPTH || visitedKeys.has(childKey);
}

/** The visited-keys set to hand to child nodes: the current path plus this node's key. */
export function nextOrgchartVisitedKeys(visitedKeys: ReadonlySet<string>, key: string): Set<string> {
  return new Set([...visitedKeys, key]);
}
