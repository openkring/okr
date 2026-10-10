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
 * Amounts the live chart cannot place on a leaf still count, so every total equals Σ of the inputs: a group's
 * own amount (a former leaf that later got children) and an account missing from the live chart (archived)
 * whose parent is live are extra rows under that parent; any other unplaced amount is a top-level row of its
 * class (by account number).
 */
export function buildAccountComparison(
  accounts: AccountModel[], totals: Map<string, CostCenterTotals>, expandedKeys: ReadonlySet<string>, labels: AccountComparisonLabels,
): AccountComparison {
  const forest = accountForest(accounts);
  const placed = new Map<string, AccountNode>();
  const collect = (n: AccountNode): void => { placed.set(n.account.okey, n); n.children.forEach(collect); };
  forest.forEach(collect);
  const byKey = new Map(accounts.map(x => [x.okey, x]));

  interface Extra { key: string; id: string; name: string; t: CostCenterTotals }
  // rows the forest has no leaf for, keyed by the live node they belong under
  const extras = new Map<string, Extra[]>();
  const addExtra = (parentKey: string, e: Extra): void => { const l = extras.get(parentKey) ?? []; l.push(e); extras.set(parentKey, l); };
  // unplaced amounts without a live parent: a top-level row per class
  const topLevel = new Map<AccountClass, Extra[]>();
  for (const [key, t] of totals) {
    if (isZero(t)) continue;
    const node = placed.get(key);
    if (node) {
      if (node.children.length > 0) addExtra(key, { key: `own:${key}`, id: node.account.id ?? '', name: node.account.name ?? '', t });
      continue;
    }
    const account = byKey.get(key);
    const e: Extra = { key, id: account?.id ?? '', name: account?.name ?? key, t };
    if (account?.parentKey && placed.has(account.parentKey)) addExtra(account.parentKey, e);
    else {
      const cls = accountClass(account?.id ?? '');
      const l = topLevel.get(cls) ?? [];
      l.push(e);
      topLevel.set(cls, l);
    }
  }

  const extrasOf = (n: AccountNode): Extra[] => extras.get(n.account.okey) ?? [];
  const sum = (n: AccountNode): CostCenterTotals => {
    const base = n.children.length === 0 ? totals.get(n.account.okey) ?? zero() : n.children.reduce((s, c) => add(s, sum(c)), zero());
    return extrasOf(n).reduce((s, e) => add(s, e.t), base);
  };
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
      const hasChildren = n.children.length > 0 || extrasOf(n).length > 0;
      const expanded = hasChildren && expandedKeys.has(n.account.okey);
      rows.push(row(n.account.okey, hasChildren ? 'group' : 'account', depth, n.account.id ?? '', n.account.name ?? '', side, hasChildren, expanded, t));
      if (!expanded) return;
      n.children.forEach(c => walk(c, depth + 1));
      for (const e of extrasOf(n)) rows.push(row(e.key, 'account', depth + 1, e.id, e.name, side, false, false, e.t));
    };
    for (const top of forest.filter(n => n.cls === cls)) {
      walk(top, 0);
      total = add(total, sum(top));
    }
    for (const e of topLevel.get(cls) ?? []) {
      rows.push(row(e.key, 'account', 0, e.id, e.name, side, false, false, e.t));
      total = add(total, e.t);
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
