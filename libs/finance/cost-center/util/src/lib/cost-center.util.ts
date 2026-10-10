import { CostCenterModel } from '@okr/shared-models';

/**
 * The active nodes of type 'leaf' (or without a type) without children — the only cost centres a booking line may
 * point at (same rule as `isActiveLeafCostCenter` in `@okr/shared-util-core`, which the server uses).
 */
export function leafCostCenters(centers: CostCenterModel[]): CostCenterModel[] {
  const parents = new Set(centers.map(c => c.parentKey).filter(k => !!k));
  // a missing type (Firestore reads skip model defaults) counts as a leaf, exactly as on the server
  return centers.filter(c => !c.isArchived && (c.type ?? 'leaf') === 'leaf' && !parents.has(c.okey));
}

/** The key itself plus the keys of all its descendants (archived ones included). */
export function costCenterSubtreeKeys(centers: CostCenterModel[], rootKey: string): Set<string> {
  const out = new Set<string>([rootKey]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of centers) {
      if (c.parentKey && out.has(c.parentKey) && !out.has(c.okey)) {
        out.add(c.okey);
        grew = true;
      }
    }
  }
  return out;
}

/** '310 Junioren'; '' when there is no cost centre. */
export function costCenterLabel(center: CostCenterModel | undefined): string {
  return center ? `${center.id} ${center.name}`.trim() : '';
}

/** The labels from the top down to the node, e.g. '300 Sport › 310 Junioren'. */
export function costCenterPath(centers: CostCenterModel[], key: string): string {
  const byKey = new Map(centers.map(c => [c.okey, c]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = byKey.get(key);
  while (current && !seen.has(current.okey)) {
    seen.add(current.okey);
    parts.unshift(costCenterLabel(current));
    current = current.parentKey ? byKey.get(current.parentKey) : undefined;
  }
  return parts.join(' › ');
}

/** True if hanging `key` under `newParentKey` would put a node below itself. */
export function wouldCreateCycle(centers: CostCenterModel[], key: string, newParentKey: string): boolean {
  if (!newParentKey) return false;
  return costCenterSubtreeKeys(centers, key).has(newParentKey);
}

/** Depth-first walk of the tree, siblings ordered by their display number. */
export function sortCostCenterTree(centers: CostCenterModel[]): { center: CostCenterModel; depth: number }[] {
  const keys = new Set(centers.map(c => c.okey));
  const byId = (a: CostCenterModel, b: CostCenterModel): number => a.id.localeCompare(b.id, 'de', { numeric: true });
  const out: { center: CostCenterModel; depth: number }[] = [];
  const walk = (parentKey: string, depth: number): void => {
    for (const c of centers.filter(x => (x.parentKey && keys.has(x.parentKey) ? x.parentKey : '') === parentKey).sort(byId)) {
      out.push({ center: c, depth });
      walk(c.okey, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

/**
 * The fiscal years the backfill can be run on (spec 1.65 D19): every year that has a period, from 2000 up to
 * `currentYear`, plus the current one, newest first. `locked` comes from the annual period (month 0); the
 * backfill runs on locked years too (D19, amended 2026-10-10), the flag only informs.
 */
export function backfillYearChoices(
  periods: { year: number; month: number; isLocked?: boolean; isArchived?: boolean }[], currentYear: number,
): { year: number; locked: boolean }[] {
  const locked = new Map<number, boolean>([[currentYear, false]]);
  for (const p of periods) {
    if (p.isArchived || p.year < 2000 || p.year > currentYear) continue;
    if (!locked.has(p.year)) locked.set(p.year, false);
    if (p.month === 0 && p.isLocked) locked.set(p.year, true);
  }
  return [...locked.entries()].sort((a, b) => b[0] - a[0]).map(([year, isLocked]) => ({ year, locked: isLocked }));
}
