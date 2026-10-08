import { AccountModel, BookingLineModel, BookingModel, BudgetLineModel, CostCenterModel } from '@okr/shared-models';
import { isProfitAndLossAccountId } from '@okr/shared-util-core';

import { costCenterSubtreeKeys } from './cost-center.util';

/** '' = ohne Kostenstelle */
export const NO_COST_CENTER_KEY = '';
export type CellSide = 'revenue' | 'expense';
export interface CostCenterCell {
  costCenterKey: string;
  accountKey: string;
  side: CellSide;
  actual: number;     // natural sign, minor units
  budget: number;     // version A, natural sign
  compare: number;    // version B (0 when none)
}
export interface CostCenterTotals { actual: number; budget: number; compare: number }
export interface CostCenterRollUp { revenue: CostCenterTotals; expense: CostCenterTotals }

/** Lines of `posted` bookings dated within [from, to] (StoreDate, inclusive). Filters by date, never by periodKey. */
export function postedLinesInRange(lines: BookingLineModel[], bookings: BookingModel[], from: string, to: string): BookingLineModel[] {
  const inRange = new Set(bookings.filter(b => b.status === 'posted' && (b.date ?? '') >= from && (b.date ?? '') <= to).map(b => b.okey));
  return lines.filter(l => inRange.has(l.bookingKey));
}

function sideOf(accountId: string): CellSide {
  return /^[456]/.test(accountId.trim()) ? 'expense' : 'revenue';
}

/**
 * Soll-Ist cells per Kostenstelle × P&L account (spec 1.65 §8.1). Pass the lines already reduced to
 * the fiscal year (`postedLinesInRange`). Balance-sheet lines are ignored; a line without
 * Kostenstelle lands in the `NO_COST_CENTER_KEY` bucket. Amounts in the account's natural sign.
 */
export function aggregateByCostCenter(
  lines: BookingLineModel[], accounts: AccountModel[],
  budgetLines: BudgetLineModel[] = [], compareLines: BudgetLineModel[] = [],
): CostCenterCell[] {
  const idByKey = new Map(accounts.map(a => [a.okey, a.id ?? '']));
  const cells = new Map<string, CostCenterCell>();
  const cell = (costCenterKey: string, accountKey: string): CostCenterCell | undefined => {
    const id = idByKey.get(accountKey) ?? '';
    if (!isProfitAndLossAccountId(id)) return undefined;
    const key = `${costCenterKey}|${accountKey}`;
    let c = cells.get(key);
    if (!c) {
      c = { costCenterKey, accountKey, side: sideOf(id), actual: 0, budget: 0, compare: 0 };
      cells.set(key, c);
    }
    return c;
  };
  for (const l of lines) {
    const c = cell(l.costCenterKey ?? NO_COST_CENTER_KEY, l.accountKey ?? '');
    if (!c) continue;
    const debit = l.debitAmount?.amount ?? 0;
    const credit = l.creditAmount?.amount ?? 0;
    c.actual += c.side === 'expense' ? debit - credit : credit - debit;
  }
  for (const b of budgetLines) {
    if (b.isArchived) continue;
    const c = cell(b.costCenterKey ?? NO_COST_CENTER_KEY, b.accountKey ?? '');
    if (c) c.budget += b.amount?.amount ?? 0;
  }
  for (const b of compareLines) {
    if (b.isArchived) continue;
    const c = cell(b.costCenterKey ?? NO_COST_CENTER_KEY, b.accountKey ?? '');
    if (c) c.compare += b.amount?.amount ?? 0;
  }
  return [...cells.values()];
}

const zero = (): CostCenterTotals => ({ actual: 0, budget: 0, compare: 0 });

/** Totals per cost centre over its whole subtree (every centre gets an entry), plus the bucket under `NO_COST_CENTER_KEY`. */
export function rollUpCostCenters(cells: CostCenterCell[], costCenters: CostCenterModel[]): Map<string, CostCenterRollUp> {
  const out = new Map<string, CostCenterRollUp>();
  const add = (key: string, c: CostCenterCell): void => {
    const entry = out.get(key) ?? { revenue: zero(), expense: zero() };
    entry[c.side].actual += c.actual;
    entry[c.side].budget += c.budget;
    entry[c.side].compare += c.compare;
    out.set(key, entry);
  };
  out.set(NO_COST_CENTER_KEY, { revenue: zero(), expense: zero() });
  for (const center of costCenters) {
    out.set(center.okey, { revenue: zero(), expense: zero() });
  }
  const subtrees = new Map(costCenters.map(center => [center.okey, costCenterSubtreeKeys(costCenters, center.okey)]));
  for (const c of cells) {
    if (c.costCenterKey === NO_COST_CENTER_KEY) { add(NO_COST_CENTER_KEY, c); continue; }
    for (const [key, subtree] of subtrees) if (subtree.has(c.costCenterKey)) add(key, c);
  }
  return out;
}
