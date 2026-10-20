import { Functions, httpsCallable } from 'firebase/functions';

/** One room the tenant backfill would stamp (or just stamped) with the tenants it belongs to. */
export interface RoomTenantChange {
  roomId: string;
  name: string;
  tenants: string[];
}

/** The typed result of `backfillMatrixRoomTenants`. */
export interface RoomTenantBackfillResult {
  /** rooms written; 0 on a dry run */
  stamped: number;
  /** rooms that already carry the right marker */
  alreadyMarked: number;
  /** room ids without a derivable tenant; they need the manual assignment */
  ambiguous: string[];
  /** the rooms the backfill stamps (dry run: would stamp), with their names */
  changes: RoomTenantChange[];
  dryRun: boolean;
}

interface RoomTenantBackfillResponse {
  stamped: number;
  alreadyMarked: number;
  ambiguous: string[];
  changes: Record<string, string[]>;
  names?: Record<string, string>;
  dryRun: boolean;
}

/**
 * Calls the operator-only `backfillMatrixRoomTenants` Cloud Function (region europe-west6; the
 * caller passes `getFunctions(getApp(), 'europe-west6')`). `dryRun` writes nothing and lists what
 * would change. Idempotent: already-marked rooms are skipped server-side.
 * The one copy of this call, shared by the AOC migration card and Chat-Wartung.
 */
export async function backfillRoomTenants(functions: Functions, dryRun: boolean): Promise<RoomTenantBackfillResult> {
  const fn = httpsCallable<{ dryRun?: boolean }, RoomTenantBackfillResponse>(functions, 'backfillMatrixRoomTenants');
  const { data } = await fn({ dryRun });
  return {
    stamped: data.stamped,
    alreadyMarked: data.alreadyMarked,
    ambiguous: data.ambiguous,
    changes: Object.entries(data.changes).map(([roomId, tenants]) => ({ roomId, name: data.names?.[roomId] ?? '', tenants })),
    dryRun: data.dryRun,
  };
}
