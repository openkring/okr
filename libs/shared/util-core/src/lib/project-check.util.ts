import { isProfitAndLossAccountId } from './cost-center.util';

/** Minimal shape of a project — structural, so Cloud Functions can pass raw Firestore docs. */
export interface ProjectLike { isArchived?: boolean; tenants?: string[] }

/**
 * A project a booking line may point at as Kostenträger (spec 3.14 Phase 4): it exists, is not
 * archived and belongs to the tenant. Projects are flat — there is no leaf check.
 */
export function isAssignableProject(project: ProjectLike | undefined, tenantId: string): boolean {
  if (!project || project.isArchived === true) return false;
  return (project.tenants ?? []).includes(tenantId);
}

/** The Kostenträger written on a line: explicit only, P&L accounts only; '' otherwise (legacy = absent = ''). */
export function projectKeyForLine(accounts: Map<string, { id?: string }>, line: { accountKey: string; projectKey?: string }): string {
  const key = (line.projectKey ?? '').trim();
  return key && isProfitAndLossAccountId(accounts.get(line.accountKey)?.id) ? key : '';
}
