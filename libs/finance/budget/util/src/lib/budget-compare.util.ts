import { AccountModel, BudgetVersionModel, CostCenterModel } from '@okr/shared-models';
import { CellSide, CostCenterCell, CostCenterRollUp, CostCenterTotals, costCenterLabel, NO_COST_CENTER_KEY, sortCostCenterTree } from '@okr/finance-cost-center-util';

import { newestApprovedBudget } from './budget.util';

/**
 * Version A of a fresh comparison: the board's reference (newest approved budget of the year), else the last
 * live draft budget of that year in list order (versions carry no creation date), else the last live version.
 */
export function defaultCompareVersion(versions: BudgetVersionModel[], year: number): BudgetVersionModel | undefined {
  const approved = newestApprovedBudget(versions, year);
  if (approved) return approved;
  const live = versions.filter(v => !v.isArchived && v.fiscalYear === year && v.status !== 'superseded');
  const drafts = live.filter(v => (v.kind ?? 'budget') === 'budget' && (v.status ?? 'draft') === 'draft');
  return drafts[drafts.length - 1] ?? live[live.length - 1];
}

export type ComparisonRowKind = 'center' | 'account' | 'none' | 'unknown';

/** One line of the Soll-Ist comparison (minor units, natural sign): A = budget, B = compare version, Ist = actual. */
export interface ComparisonRow {
  /** stable id, also the expand/collapse key: `center:<okey>`, `account:<parent>:<accountKey>`, `bucket:none`, `bucket:unknown` */
  key: string;
  kind: ComparisonRowKind;
  depth: number;
  /** the Kostenstelle label or the account number + name; empty for the two buckets (the page names them) */
  label: string;
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

export interface ComparisonSection {
  rows: ComparisonRow[];
  /** Σ of the top-level Kostenstellen and the buckets */
  total: CostCenterTotals;
}

/** actual / budget in percent (rounded to a whole number); undefined when there is no budget to measure against. */
export function usedPercent(actual: number, budget: number): number | undefined {
  return budget === 0 ? undefined : Math.round((actual / budget) * 100);
}

const sum = (a: CostCenterTotals, b: CostCenterTotals): CostCenterTotals =>
  ({ actual: a.actual + b.actual, budget: a.budget + b.budget, compare: a.compare + b.compare });
const isZero = (t: CostCenterTotals): boolean => t.actual === 0 && t.budget === 0 && t.compare === 0;
const toTotals = (c: CostCenterCell): CostCenterTotals => ({ actual: c.actual, budget: c.budget, compare: c.compare });

/**
 * The rows of one side (expense or revenue) of the comparison (spec 1.65 phase 2): the Kostenstellen tree from
 * the roll-up, a group or leaf expandable to its account cells, then «ohne Kostenstelle» and — only when cells
 * point at a centre outside the tree — «unbekannte Kostenstelle». Collapsed rows hide their children. Everything
 * adds up: a centre's children (own accounts + sub-centres) are its row, the section total is Σ top level + buckets.
 * A row without any amount is left out.
 */
export function buildComparisonRows(
  cells: CostCenterCell[], rollUp: Map<string, CostCenterRollUp>, costCenters: CostCenterModel[], accounts: AccountModel[],
  expandedKeys: ReadonlySet<string>, side: CellSide,
): ComparisonSection {
  const accountByKey = new Map(accounts.map(a => [a.okey, a]));
  const tree = sortCostCenterTree(costCenters);
  const known = new Set(costCenters.map(c => c.okey));
  const sideCells = cells.filter(c => c.side === side);

  const accountRows = (parentId: string, list: CostCenterCell[], depth: number): ComparisonRow[] => {
    const byAccount = new Map<string, CostCenterTotals>();
    for (const c of list) byAccount.set(c.accountKey, sum(byAccount.get(c.accountKey) ?? { actual: 0, budget: 0, compare: 0 }, toTotals(c)));
    return [...byAccount.entries()]
      .filter(([, t]) => !isZero(t))
      .map(([accountKey, t]) => {
        const a = accountByKey.get(accountKey);
        return { ...t, accountKey, id: a?.id ?? '', name: a?.name ?? accountKey };
      })
      .sort((x, y) => x.id.localeCompare(y.id, 'de', { numeric: true }))
      .map(x => row(`account:${parentId}:${x.accountKey}`, 'account', depth, `${x.id} ${x.name}`.trim(), false, false, x));
  };

  const row = (key: string, kind: ComparisonRowKind, depth: number, label: string, expandable: boolean, expanded: boolean, t: CostCenterTotals): ComparisonRow =>
    ({ key, kind, depth, label, expandable, expanded, actual: t.actual, budget: t.budget, compare: t.compare, diff: t.actual - t.budget, used: usedPercent(t.actual, t.budget) });

  const childrenOf = (parentKey: string): CostCenterModel[] =>
    tree.filter(t => (t.center.parentKey && known.has(t.center.parentKey) ? t.center.parentKey : '') === parentKey).map(t => t.center);

  const centerRows = (center: CostCenterModel, depth: number): ComparisonRow[] => {
    const totals = rollUp.get(center.okey)?.[side];
    if (!totals || isZero(totals)) return [];
    const key = `center:${center.okey}`;
    const own = sideCells.filter(c => c.costCenterKey === center.okey);
    const kids = childrenOf(center.okey);
    const expandable = own.some(c => !isZero(toTotals(c))) || kids.some(k => centerRows(k, depth + 1).length > 0);
    const expanded = expandable && expandedKeys.has(key);
    const out = [row(key, 'center', depth, costCenterLabel(center), expandable, expanded, totals)];
    if (expanded) {
      out.push(...accountRows(center.okey, own, depth + 1));
      for (const k of kids) out.push(...centerRows(k, depth + 1));
    }
    return out;
  };

  const rows: ComparisonRow[] = [];
  let total: CostCenterTotals = { actual: 0, budget: 0, compare: 0 };
  for (const root of childrenOf('')) {
    const r = centerRows(root, 0);
    if (r.length > 0) { rows.push(...r); total = sum(total, r[0]); }
  }

  const bucket = (id: 'none' | 'unknown', list: CostCenterCell[]): void => {
    const t = list.reduce((acc, c) => sum(acc, toTotals(c)), { actual: 0, budget: 0, compare: 0 });
    if (isZero(t)) return;
    const key = `bucket:${id}`;
    const children = accountRows(id, list, 1);
    const expanded = children.length > 0 && expandedKeys.has(key);
    rows.push(row(key, id, 0, '', children.length > 0, expanded, t));
    if (expanded) rows.push(...children);
    total = sum(total, t);
  };
  bucket('none', sideCells.filter(c => c.costCenterKey === NO_COST_CENTER_KEY));
  bucket('unknown', sideCells.filter(c => c.costCenterKey !== NO_COST_CENTER_KEY && !known.has(c.costCenterKey)));

  return { rows, total };
}
