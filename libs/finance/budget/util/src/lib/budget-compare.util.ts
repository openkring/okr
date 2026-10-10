import { BudgetVersionModel } from '@okr/shared-models';

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

/** actual / budget in percent (rounded to a whole number); undefined when there is no budget to measure against. */
export function usedPercent(actual: number, budget: number): number | undefined {
  return budget === 0 ? undefined : Math.round((actual / budget) * 100);
}
