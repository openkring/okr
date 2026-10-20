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

/**
 * How many items a finished migration still leaves for manual work (the Matrix rooms the automatic
 * part cannot derive). Such a migration stays erledigt, but its card must name them. Only an
 * erledigt or offen check can have any; an error has none to report.
 */
export function manualAssignCount(state: { status: MigrationStatus; ambiguous?: number } | undefined): number {
  if (!state || state.status === 'error') return 0;
  const n = state.ambiguous ?? 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
