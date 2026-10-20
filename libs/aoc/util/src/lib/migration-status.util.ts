export type MigrationStatus = 'offen' | 'erledigt' | 'error';

/**
 * The status a migration card shows after «Prüfen»: offen while something is pending, erledigt
 * only when the check came back with exactly nothing pending. A failed check (an Error, or a
 * count that is not a non-negative number) is never erledigt.
 */
export function migrationStatus(result: { pending: number } | Error): MigrationStatus {
  if (result instanceof Error) return 'error';
  const { pending } = result;
  if (!Number.isFinite(pending) || pending < 0) return 'error';
  return pending > 0 ? 'offen' : 'erledigt';
}
