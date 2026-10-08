import { AccountModel } from '@okr/shared-models';
import { CellSide, CostCenterTotals } from '@okr/finance-cost-center-util';

/** Shared by the grid and the comparison rows: totals arithmetic and how an account row is named and ordered. */
export const zeroTotals = (): CostCenterTotals => ({ actual: 0, budget: 0, compare: 0 });

export const addTotals = (a: CostCenterTotals, b: CostCenterTotals): CostCenterTotals =>
  ({ actual: a.actual + b.actual, budget: a.budget + b.budget, compare: a.compare + b.compare });

export const isZeroTotals = (t: CostCenterTotals): boolean => t.actual === 0 && t.budget === 0 && t.compare === 0;

/** Account number and name of a key; an unknown account falls back to its key as the name. */
export function accountParts(accountByKey: ReadonlyMap<string, AccountModel>, accountKey: string): { account: AccountModel | undefined; id: string; name: string } {
  const account = accountByKey.get(accountKey);
  return { account, id: account?.id ?? '', name: account?.name ?? '' };
}

/** Order by account number, numerically. */
export const compareAccountIds = (a: string, b: string): number => a.localeCompare(b, 'de', { numeric: true });

/** More actual than budget is bad for an expense, less for a revenue (`diff` = actual − budget). */
export const isOver = (side: CellSide, diff: number): boolean => (side === 'expense' ? diff > 0 : diff < 0);

/** The net result (revenue − expense) is bad when it stays below the budgeted one (`diff` = actual − budget). */
export const isNetOver = (diff: number): boolean => diff < 0;
