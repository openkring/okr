import { AccountModel, CostAllocationModel } from '@okr/shared-models';

import { CellSide, CostCenterCell, CostCenterRollUp } from './cost-center-aggregate';

/** One Umlage as it appears in a Soll-Ist view: signed for the selection (+ at the target, − at the source). */
export interface AllocationRow { key: string; side: CellSide; title: string; budget: number; actual: number }

/**
 * The Umlagen (spec 1.65 D24) that cross the boundary of `selection` — the selected Kostenstelle's subtree, or
 * `'all'` (then every rule nets to zero and none is shown). A rule moves a fixed amount (Soll = Ist) or a percentage
 * of the source's **primary** amount on its side (Soll: of the source subtree's budget, Ist: of its actuals —
 * `rollUp` = `rollUpCostCenters` over the cells, no cascade). Only live rules of `fiscalYear` and the books count.
 */
export function applyAllocations(
  rules: CostAllocationModel[], selection: Set<string> | 'all', rollUp: Map<string, CostCenterRollUp>,
  fiscalYear: number, accountingTenantId: string,
): AllocationRow[] {
  if (selection === 'all') return [];
  const rows: AllocationRow[] = [];
  for (const r of rules) {
    if (r.isArchived || r.fiscalYear !== fiscalYear || r.accountingTenantId !== accountingTenantId) continue;
    const fromIn = selection.has(r.fromCostCenterKey);
    const toIn = selection.has(r.toCostCenterKey);
    if (fromIn === toIn) continue;
    const side: CellSide = r.side === 'revenue' ? 'revenue' : 'expense';
    let budget: number;
    let actual: number;
    if (r.mode === 'amount') {
      budget = actual = r.amount?.amount ?? 0;
    } else {
      const source = rollUp.get(r.fromCostCenterKey)?.[side] ?? { budget: 0, actual: 0 };
      const share = (r.percent ?? 0) / 100;
      budget = Math.round(source.budget * share);
      actual = Math.round(source.actual * share);
    }
    const sign = toIn ? 1 : -1;
    rows.push({ key: `allocation:${r.okey}`, side, title: r.title ?? '', budget: sign * budget, actual: sign * actual });
  }
  return rows;
}

/**
 * The cells a percentage Umlage takes its base from (D24): Aufwand = classes 4–6, Ertrag = class 3 only.
 * `aggregateByCostCenter` files classes 7–9 (übriger Erfolg) on the revenue side too; they are their own section in
 * the comparison and never part of an Umlage's base. Pass the result to `rollUpCostCenters` for `applyAllocations`.
 */
export function allocationBaseCells(cells: CostCenterCell[], accounts: Pick<AccountModel, 'okey' | 'id'>[]): CostCenterCell[] {
  const idByKey = new Map(accounts.map(a => [a.okey, (a.id ?? '').trim()]));
  return cells.filter(c => c.side === 'expense' || (idByKey.get(c.accountKey) ?? '').startsWith('3'));
}
