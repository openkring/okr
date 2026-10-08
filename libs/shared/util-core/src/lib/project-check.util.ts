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

/**
 * Shape check for a projectKey sent to a booking callable: absent, or a string that can be a
 * Firestore document id (no '/'). Anything else is refused with 'project-invalid' before it reaches
 * `.trim()` or `doc()`.
 */
export function isProjectKeyShapeValid(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === 'string' && !value.includes('/');
}

/** Minimal line shape for the carry-over — structural, so Cloud Functions can pass raw Firestore data. */
export interface ProjectCarryLine {
  accountKey?: string;
  debitAmount?: unknown;
  projectKey?: string;
}

/**
 * A client older than spec 3.14 knows nothing of `projectKey` and sends lines without the property.
 * Rewriting the booking from such a request would silently wipe the Kostenträger. So when NO incoming
 * line has the property, each line takes the projectKey of a stored line with the same account and
 * side (debit/credit), every stored line used once; unmatched lines get ''. A request in which any
 * line carries the property (a current client, '' meaning "none") is returned unchanged.
 */
export function carryOverProjectKeys<T extends ProjectCarryLine>(lines: T[], storedLines: ProjectCarryLine[]): T[] {
  if (lines.some(l => Object.prototype.hasOwnProperty.call(l, 'projectKey'))) return lines;
  const isDebit = (l: ProjectCarryLine) => !!l.debitAmount;
  const used = new Set<number>();
  return lines.map(line => {
    const idx = storedLines.findIndex((s, i) => !used.has(i) && s.accountKey === line.accountKey && isDebit(s) === isDebit(line));
    if (idx === -1) return { ...line, projectKey: '' };
    used.add(idx);
    return { ...line, projectKey: (storedLines[idx].projectKey ?? '').trim() };
  });
}
