import { CostAllocationModel, CostCenterModel } from '@okr/shared-models';
import { costCenterSubtreeKeys } from '@okr/finance-cost-center-util';

/** Whose booking lines a set of project results needs: projects by `projectKey`, Kostenstellen by `costCenterKey`. */
export interface ProjectLineSources { projectKeys: string[]; costCenterKeys: string[] }

/**
 * The lines the Ist of `projectKeys` needs (spec 1.177 R5): their own, plus the base of every percentage Umlage they
 * receive — the source project, or the source Kostenstelle with its subtree. A fixed amount and an Umlage given away
 * need nothing more (the giving project's own lines are loaded anyway). Everything else of the ledger stays unread.
 * Sorted, without doubles.
 */
export function projectLineSources(
  rules: CostAllocationModel[], projectKeys: string[], costCenters: CostCenterModel[], accountingTenantId: string,
): ProjectLineSources {
  const wanted = new Set(projectKeys);
  const projects = new Set(projectKeys);
  const centers = new Set<string>();
  for (const r of rules) {
    if (r.isArchived || r.accountingTenantId !== accountingTenantId || r.mode === 'amount' || !wanted.has(r.toProjectKey ?? '')) continue;
    if (r.scope === 'project' && r.fromProjectKey) projects.add(r.fromProjectKey);
    if (r.scope === 'centerToProject' && r.fromCostCenterKey) costCenterSubtreeKeys(costCenters, r.fromCostCenterKey).forEach(k => centers.add(k));
  }
  return { projectKeys: [...projects].sort(), costCenterKeys: [...centers].sort() };
}
