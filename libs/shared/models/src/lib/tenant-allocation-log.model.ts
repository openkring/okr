import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** Which way an allocation went. */
export type AllocationDirection = 'grant' | 'revoke';

/**
 * Evidence that a tenant allocation ran (spec 1.47, D-TA-5).
 *
 * Written by the `allocateTenant` Cloud Function only, readable by the acting tenant's
 * admins, never writable from a client.
 *
 * Unlike `ErasureLogModel` this entry deliberately DOES carry the subject's key: the whole
 * point of the log is to answer "whom did we hand to whom, and when". That makes the
 * collection personal data, which is why it needs a row in
 * `apps/functions/src/privacy/subject-data-map.ts` (T4) — without one it is invisible to the
 * data export and silently survives an erasure (D-P5-3).
 */
export class TenantAllocationLogModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public tenantId = '';                    // the acting tenant (the admin's own)
  public targetTenantId = '';              // the tenant granted or revoked
  public direction: AllocationDirection = 'grant';
  public modelType = 'person';             // D-TA-7: widened later, never narrowed
  public subjectKey = '';                  // the personKey — D-TA-5
  public actorUid = '';                    // the admin who did it
  public executedAt = '';                  // store date-time (yyyymmddHHmmss)
  public channels: string[] = [];          // the addressChannel values that travelled
  public counts: Record<string, number> = {};   // documents touched, per collection
}

export const TenantAllocationLogCollection = 'tenant-allocation-log';
export const TenantAllocationLogModelName = 'tenantAllocationLog';
