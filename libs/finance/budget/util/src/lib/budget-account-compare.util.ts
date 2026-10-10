import { AccountModel } from '@okr/shared-models';
import { CellSide, CostCenterCell, CostCenterTotals } from '@okr/finance-cost-center-util';
import { AccountClass, accountClass, AccountNode, accountForest } from '@okr/finance-reporting-util';

import { usedPercent } from './budget-compare.util';
import { addTotals as add, isZeroTotals as isZero, zeroTotals as zero } from './budget-rows.util';

export type AccountComparisonKind = 'group' | 'account' | 'total' | 'result';

/** One line of the Soll-Ist comparison by account (minor units, natural sign): A = budget, B = compare version, Ist = actual. */
export interface AccountComparisonRow {
  /** account okey; 'total-revenue' | 'total-expense' | 'total-other' | 'net' */
  key: string;
  kind: AccountComparisonKind;
  depth: number;
  /** account number, '' for totals */
  id: string;
  /** account name or the total's label */
  name: string;
  /** which sign rules «over budget»: expense for classes 4–6, revenue otherwise, net for the Jahresergebnis */
  side: CellSide | 'net';
  expandable: boolean;
  expanded: boolean;
  actual: number;
  budget: number;
  compare: number;
  /** actual − budget A */
  diff: number;
  /** actual / budget A in percent, undefined when A is 0 */
  used: number | undefined;
}

export interface AccountComparisonLabels { revenue: string; expense: string; other: string; net: string }

export interface AccountComparison {
  rows: AccountComparisonRow[];
  revenue: CostCenterTotals;
  expense: CostCenterTotals;
  other: CostCenterTotals;
  net: CostCenterTotals;
}

/** Σ of the Soll-Ist cells per account, over every Kostenstelle (spec 1.65 D18). */
export function totalsByAccount(cells: CostCenterCell[]): Map<string, CostCenterTotals> {
  const out = new Map<string, CostCenterTotals>();
  for (const c of cells) out.set(c.accountKey, add(out.get(c.accountKey) ?? zero(), { actual: c.actual, budget: c.budget, compare: c.compare }));
  return out;
}

const sideOf = (cls: AccountClass): CellSide => (cls === 'expense' ? 'expense' : 'revenue');

/**
 * The Soll-Ist comparison as an Erfolgsrechnung (spec 1.65 D18): Ertrag, Aufwand and übriger Erfolg
 * along the chart of accounts, each closed by its total, then the Jahresergebnis
 * (revenue + other − expense, as `yearResult`). A group carries the sum of its subtree and lists its
 * children only when its okey is in `expandedKeys`. Rows zero in all three columns are left out.
 * Amounts on an account that is missing from the live chart (archived, unknown) are listed as an extra
 * leaf below the top node of their class, so every total still equals Σ of the inputs.
 */
export function buildAccountComparison(
  accounts: AccountModel[], totals: Map<string, CostCenterTotals>, expandedKeys: ReadonlySet<string>, labels: AccountComparisonLabels,
): AccountComparison {
  const forest = accountForest(accounts);
  const placed = new Set<string>();
  const collect = (n: AccountNode): void => { placed.add(n.account.okey); n.children.forEach(collect); };
  forest.forEach(collect);
  const byKey = new Map(accounts.map(x => [x.okey, x]));
  // amounts the forest cannot place (archived/unknown account): an extra leaf per class
  const orphans = new Map<AccountClass, AccountModel[]>();
  for (const key of totals.keys()) {
    if (placed.has(key)) continue;
    const account = byKey.get(key) ?? { ...new AccountModel(''), okey: key, id: '', name: key };
    const cls = accountClass(account.id ?? '');
    const list = orphans.get(cls) ?? [];
    list.push(account);
    orphans.set(cls, list);
  }

  const sum = (n: AccountNode): CostCenterTotals => n.children.length === 0
    ? totals.get(n.account.okey) ?? zero()
    : n.children.reduce((s, c) => add(s, sum(c)), zero());
  const row = (key: string, kind: AccountComparisonKind, depth: number, id: string, name: string, side: CellSide | 'net',
    expandable: boolean, expanded: boolean, t: CostCenterTotals): AccountComparisonRow =>
    ({ key, kind, depth, id, name, side, expandable, expanded, ...t, diff: t.actual - t.budget, used: usedPercent(t.actual, t.budget) });

  const section = (cls: AccountClass, label: string, totalKey: string): { rows: AccountComparisonRow[]; total: CostCenterTotals } => {
    const side = sideOf(cls);
    const rows: AccountComparisonRow[] = [];
    let total = zero();
    const walk = (n: AccountNode, depth: number): void => {
      const t = sum(n);
      if (isZero(t)) return;
      const hasChildren = n.children.length > 0;
      const expanded = hasChildren && expandedKeys.has(n.account.okey);
      rows.push(row(n.account.okey, hasChildren ? 'group' : 'account', depth, n.account.id ?? '', n.account.name ?? '', side, hasChildren, expanded, t));
      if (expanded) n.children.forEach(c => walk(c, depth + 1));
    };
    for (const top of forest.filter(n => n.cls === cls)) {
      walk(top, 0);
      total = add(total, sum(top));
    }
    for (const o of orphans.get(cls) ?? []) {
      const t = totals.get(o.okey) ?? zero();
      if (isZero(t)) continue;
      rows.push(row(o.okey, 'account', 1, o.id ?? '', o.name ?? o.okey, side, false, false, t));
      total = add(total, t);
    }
    if (rows.length > 0) rows.push(row(totalKey, 'total', 0, '', label, side, false, false, total));
    return { rows, total };
  };

  const revenue = section('revenue', labels.revenue, 'total-revenue');
  const expense = section('expense', labels.expense, 'total-expense');
  const other = section('result', labels.other, 'total-other');
  const net: CostCenterTotals = {
    actual: revenue.total.actual + other.total.actual - expense.total.actual,
    budget: revenue.total.budget + other.total.budget - expense.total.budget,
    compare: revenue.total.compare + other.total.compare - expense.total.compare,
  };
  return {
    rows: [...revenue.rows, ...expense.rows, ...other.rows, row('net', 'result', 0, '', labels.net, 'net', false, false, net)],
    revenue: revenue.total, expense: expense.total, other: other.total, net,
  };
}
