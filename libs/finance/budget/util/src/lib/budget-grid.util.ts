import { AccountModel, BudgetLineModel, CostCenterModel } from '@okr/shared-models';
import { CostCenterCell, CostCenterRollUp, leafCostCenters, rollUpCostCenters, sortCostCenterTree } from '@okr/finance-cost-center-util';

/** One cell of a Kostenstelle: budget (from the version's line, 0 when unbudgeted) and the actual of the fiscal year (minor units, natural sign). */
export interface BudgetGridRow {
  /** the version's budget line; undefined for a cell that only has actuals («nicht budgetiert») */
  line: BudgetLineModel | undefined;
  costCenterKey: string;
  accountKey: string;
  account: AccountModel | undefined;
  accountId: string;
  accountName: string;
  budgeted: boolean;
  budget: number;
  actual: number;
  /** budget − actual */
  remaining: number;
}

export interface BudgetGridSection {
  center: CostCenterModel;
  depth: number;
  /** a leaf shows a card with footer; any other node is a section title with its rolled-up totals */
  isLeaf: boolean;
  /** the cells booked directly on this Kostenstelle (on a group only for a former leaf that got children) */
  rows: BudgetGridRow[];
  /** a leaf: Σ rows. A group: the roll-up of its whole subtree. */
  totals: CostCenterRollUp;
}

export interface BudgetGrid {
  sections: BudgetGridSection[];
  /** Σ of every cell on a Kostenstelle (each cell once, no roll-up double counting) */
  total: CostCenterRollUp;
  /** actuals booked without a Kostenstelle — budget never sits there */
  unassigned: CostCenterRollUp;
}

const zero = () => ({ actual: 0, budget: 0, compare: 0 });
const emptyRollUp = (): CostCenterRollUp => ({ revenue: zero(), expense: zero() });

/** revenue − expense of one total (natural sign each), for budget, actual or both. */
export function netOf(totals: CostCenterRollUp, field: 'budget' | 'actual'): number {
  return totals.revenue[field] - totals.expense[field];
}

/**
 * The budget grid of one version (spec 1.65 phase 2): per Kostenstelle in tree order, the rows are every cell of
 * the Kostenstelle — the version's budget lines and the cells that only have actuals — sorted by account number.
 * Every amount in a footer is the sum of the rows above it. Drafts show every active leaf (so a cell can be
 * added); otherwise a Kostenstelle is shown when it has rows. A group is shown when it or a descendant is shown.
 * `cells` come from `aggregateByCostCenter(lines of the year, accounts, versionLines)`.
 */
export function buildBudgetGrid(
  cells: CostCenterCell[], versionLines: BudgetLineModel[], costCenters: CostCenterModel[], accounts: AccountModel[], editable: boolean,
): BudgetGrid {
  const rollUp = rollUpCostCenters(cells, costCenters);
  const accountByKey = new Map(accounts.map(a => [a.okey, a]));
  const leafKeys = new Set(leafCostCenters(costCenters).map(c => c.okey));
  const live = versionLines.filter(l => !l.isArchived);

  const rowsOf = (centerKey: string): BudgetGridRow[] =>
    cells
      .filter(c => c.costCenterKey === centerKey)
      .map(c => {
        const account = accountByKey.get(c.accountKey);
        const line = live.find(l => l.costCenterKey === centerKey && l.accountKey === c.accountKey);
        return {
          line, costCenterKey: centerKey, accountKey: c.accountKey, account, accountId: account?.id ?? '', accountName: account?.name ?? '',
          budgeted: !!line, budget: c.budget, actual: c.actual, remaining: c.budget - c.actual,
        };
      })
      .filter(r => r.budgeted || r.actual !== 0)
      .sort((a, b) => a.accountId.localeCompare(b.accountId, 'de', { numeric: true }));

  const tree = sortCostCenterTree(costCenters);
  const sections: BudgetGridSection[] = tree.map(({ center, depth }) => {
    const isLeaf = !tree.some(t => t.center.parentKey === center.okey);
    const rows = rowsOf(center.okey);
    let totals = rollUp.get(center.okey) ?? emptyRollUp();
    if (isLeaf) { // a leaf's footer is exactly the sum of its rows
      totals = emptyRollUp();
      for (const r of rows) {
        const side = cells.find(c => c.costCenterKey === r.costCenterKey && c.accountKey === r.accountKey)?.side ?? 'expense';
        totals[side].actual += r.actual;
        totals[side].budget += r.budget;
      }
    }
    return { center, depth, isLeaf, rows, totals };
  });

  const visible = new Set<string>();
  for (const s of sections) {
    if (s.rows.length > 0 || (s.isLeaf && editable && leafKeys.has(s.center.okey))) visible.add(s.center.okey);
  }
  const byKey = new Map(costCenters.map(c => [c.okey, c]));
  for (const key of [...visible]) {
    let parent = byKey.get(key)?.parentKey;
    const guard = new Set<string>();
    while (parent && !guard.has(parent)) { guard.add(parent); visible.add(parent); parent = byKey.get(parent)?.parentKey; }
  }

  const known = new Set(costCenters.map(c => c.okey));
  const total = emptyRollUp();
  for (const c of cells) {
    if (!known.has(c.costCenterKey)) continue;
    total[c.side].actual += c.actual;
    total[c.side].budget += c.budget;
  }
  return {
    sections: sections.filter(s => visible.has(s.center.okey)),
    total,
    unassigned: rollUp.get('') ?? emptyRollUp(),
  };
}
