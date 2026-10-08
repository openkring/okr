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
