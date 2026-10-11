import { AccountModel, BookingLineModel, BookingModel, CostAllocationModel, CostCenterModel } from '@okr/shared-models';
import {
  aggregateByCostCenter, allocationBaseCells, applyProjectAllocations, CellSide, postedLinesInRange, ProjectAllocationRow, rollUpCostCenters
} from '@okr/finance-cost-center-util';
import { fiscalYear as fiscalYearRange } from '@okr/finance-reporting-util';

/**
 * The project Umlagen of `projectKey` (spec 1.65 D26) from the journal data of the books: the % bases are the source
 * project's primary Ist over all years, and the source Kostenstelle subtree's primary Ist in the rule's fiscal year
 * (Ertrag = class 3, Aufwand = 4–6; posted lines only). Ist only — the project budget is never allocated.
 */
export function projectAllocationRows(
  rules: CostAllocationModel[], projectKey: string, lines: BookingLineModel[], bookings: BookingModel[],
  accounts: AccountModel[], costCenters: CostCenterModel[], fiscalYearStart: number, accountingTenantId: string,
): ProjectAllocationRow[] {
  const relevant = rules.filter(r => (r.scope ?? 'center') !== 'center' && !r.isArchived);
  if (relevant.length === 0) return [];
  const projectCache = new Map<string, Record<CellSide, number>>();
  const projectActual = (pk: string, side: CellSide): number => {
    let totals = projectCache.get(pk);
    if (!totals) {
      const own = postedLinesInRange(lines.filter(l => (l.projectKey ?? '') === pk), bookings, '', '99999999');
      totals = { revenue: 0, expense: 0 };
      for (const c of allocationBaseCells(aggregateByCostCenter(own, accounts), accounts)) totals[c.side] += c.actual;
      projectCache.set(pk, totals);
    }
    return totals[side];
  };
  const yearCache = new Map<number, ReturnType<typeof rollUpCostCenters>>();
  const centerActual = (costCenterKey: string, year: number, side: CellSide): number => {
    let rollUp = yearCache.get(year);
    if (!rollUp) {
      const range = fiscalYearRange(year, fiscalYearStart);
      const cells = aggregateByCostCenter(postedLinesInRange(lines, bookings, range.from, range.to), accounts);
      rollUp = rollUpCostCenters(allocationBaseCells(cells, accounts), costCenters);
      yearCache.set(year, rollUp);
    }
    return rollUp.get(costCenterKey)?.[side].actual ?? 0;
  };
  return applyProjectAllocations(relevant, projectKey, projectActual, centerActual, accountingTenantId);
}
