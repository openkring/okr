import { AccountModel, BudgetLineModel, CostCenterModel } from '@okr/shared-models';
import { CostCenterCell, CostCenterRollUp, leafCostCenters, rollUpCostCenters, sortCostCenterTree } from '@okr/finance-cost-center-util';

/** One budget cell of a Kostenstelle: the line, its account and the actual of the fiscal year (minor units, natural sign). */
export interface BudgetGridRow {
  line: BudgetLineModel;
  account: AccountModel | undefined;
  accountId: string;
  accountName: string;
  budget: number;
  actual: number;
  /** budget − actual */
  remaining: number;
}

export interface BudgetGridSection {
  center: CostCenterModel;
  depth: number;
  /** a leaf shows a card with rows; any other node is a section title with its rolled-up totals */
  isLeaf: boolean;
  rows: BudgetGridRow[];
  totals: CostCenterRollUp;
}

export interface BudgetGrid {
  sections: BudgetGridSection[];
  /** totals over all Kostenstellen (without the bucket «ohne Kostenstelle») */
  total: CostCenterRollUp;
  /** actuals booked without a Kostenstelle — budget never sits there */
  unassigned: CostCenterRollUp;
}

const zero = () => ({ actual: 0, budget: 0, compare: 0 });

/** revenue − expense of one total (natural sign each), for budget, actual or both. */
export function netOf(totals: CostCenterRollUp, field: 'budget' | 'actual'): number {
  return totals.revenue[field] - totals.expense[field];
}

/**
 * The budget grid of one version (spec 1.65 phase 2): per Kostenstelle in tree order, the rows are the version's cells
 * (sorted by account number) with the actual of the fiscal year. Draft pages show every active leaf (so a cell can be
 * added), frozen versions only the leaves that have cells. A group is kept when a descendant is shown.
 * `cells` come from `aggregateByCostCenter(lines of the year, accounts, versionLines)`.
 */
export function buildBudgetGrid(
  cells: CostCenterCell[], versionLines: BudgetLineModel[], costCenters: CostCenterModel[], accounts: AccountModel[], editable: boolean,
): BudgetGrid {
  const rollUp = rollUpCostCenters(cells, costCenters);
  const accountByKey = new Map(accounts.map(a => [a.okey, a]));
  const actualOf = new Map(cells.map(c => [`${c.costCenterKey}|${c.accountKey}`, c.actual]));
  const leafKeys = new Set(leafCostCenters(costCenters).map(c => c.okey));
  const live = versionLines.filter(l => !l.isArchived);

  const rowsOf = (centerKey: string): BudgetGridRow[] => {
    const seen = new Set<string>();
    const out: BudgetGridRow[] = [];
    for (const line of live.filter(l => l.costCenterKey === centerKey)) {
      if (seen.has(line.accountKey)) continue; // validation forbids duplicates; the first one wins
      seen.add(line.accountKey);
      const account = accountByKey.get(line.accountKey);
      const budget = live.filter(l => l.costCenterKey === centerKey && l.accountKey === line.accountKey)
        .reduce((sum, l) => sum + (l.amount?.amount ?? 0), 0);
      const actual = actualOf.get(`${centerKey}|${line.accountKey}`) ?? 0;
      out.push({ line, account, accountId: account?.id ?? '', accountName: account?.name ?? '', budget, actual, remaining: budget - actual });
    }
    return out.sort((a, b) => a.accountId.localeCompare(b.accountId, 'de', { numeric: true }));
  };

  const tree = sortCostCenterTree(costCenters);
  const sections: BudgetGridSection[] = tree.map(({ center, depth }) => {
    const isLeaf = leafKeys.has(center.okey) || !tree.some(t => t.center.parentKey === center.okey);
    return { center, depth, isLeaf, rows: isLeaf ? rowsOf(center.okey) : [], totals: rollUp.get(center.okey) ?? { revenue: zero(), expense: zero() } };
  });

  // visibility: leaves with rows (or any active leaf in a draft); groups when a descendant is visible
  const visible = new Set<string>();
  for (const s of sections) {
    if (s.isLeaf && (s.rows.length > 0 || (editable && leafKeys.has(s.center.okey)))) visible.add(s.center.okey);
  }
  const byKey = new Map(costCenters.map(c => [c.okey, c]));
  for (const key of [...visible]) {
    let parent = byKey.get(key)?.parentKey;
    const guard = new Set<string>();
    while (parent && !guard.has(parent)) { guard.add(parent); visible.add(parent); parent = byKey.get(parent)?.parentKey; }
  }

  const total: CostCenterRollUp = { revenue: zero(), expense: zero() };
  for (const s of sections.filter(x => x.isLeaf)) {
    for (const side of ['revenue', 'expense'] as const) {
      total[side].actual += s.totals[side].actual;
      total[side].budget += s.totals[side].budget;
    }
  }
  return {
    sections: sections.filter(s => visible.has(s.center.okey)),
    total,
    unassigned: rollUp.get('') ?? { revenue: zero(), expense: zero() },
  };
}
