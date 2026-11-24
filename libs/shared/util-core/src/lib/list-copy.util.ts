import { isOwnedBy, pickForTenant, SYSTEM_TENANT } from './query.util';

/**
 * How a tenant holds a list (category or tag definition).
 * `shared`: it sees a document it does not own alone. `own`: owned alone, no shared original.
 * `copy`: owned alone, and the shared original (`system`) still exists.
 */
export interface ListCopyStatus<T> {
  kind: 'own' | 'shared' | 'copy';
  shared?: T;
  /** names of the shared list the copy lacks, in shared order */
  missing: string[];
}

/** @param candidates the undeduplicated documents of ONE list (same `name` / `tagModel`) */
export function copyStatus<T extends { tenants?: string[] }>(
  candidates: readonly T[], tenantId: string, namesOf: (doc: T) => string[],
): ListCopyStatus<T> {
  const seen = pickForTenant(candidates, tenantId);
  if (!seen) return { kind: 'own', missing: [] };
  if (!isOwnedBy(seen, tenantId)) return { kind: 'shared', shared: seen, missing: [] };
  const shared = candidates.find(doc => (doc.tenants ?? []).includes(SYSTEM_TENANT));
  if (!shared) return { kind: 'own', missing: [] };
  const present = new Set(namesOf(seen));
  return { kind: 'copy', shared, missing: [...new Set(namesOf(shared))].filter(name => !present.has(name)) };
}

const PFX = '@shared/ui.listCopy.';

/** The texts of the copy status, the same for categories and tags. */
export const LIST_COPY_I18N_KEYS = {
  shared:          PFX + 'shared',
  own:             PFX + 'own',
  copy_one:        PFX + 'copy_one',
  copy_many:       PFX + 'copy_many',
  add:             PFX + 'add',
  restore:         PFX + 'restore',
  restore_confirm: PFX + 'restore_confirm',
  restore_conf:    PFX + 'restore_conf',
  restore_error:   PFX + 'restore_error',
  restore_none:    PFX + 'restore_none',
} satisfies Record<string, string>;

/** Which of the texts names this status; `copy_many` holds a `{n}` for the number of missing entries. */
export function listCopyTextKey(status: Pick<ListCopyStatus<unknown>, 'kind' | 'missing'>): 'shared' | 'own' | 'copy_one' | 'copy_many' {
  if (status.kind !== 'copy' || status.missing.length === 0) return status.kind === 'shared' ? 'shared' : 'own';
  return status.missing.length === 1 ? 'copy_one' : 'copy_many';
}
