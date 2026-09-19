import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** Which way an allocation went. */
export type AllocationDirection = 'grant' | 'revoke';

/**
 * What kind of record an allocation moves (D-TA-7, widened 2026-09-19).
 *
 * This is a CONTRACT type, not a schema change: `TenantAllocationLogModel.modelType` below
 * stays a plain `string` so an older log entry never fails to parse. It is shared with the
 * `allocateTenant` callable — client and function must agree on the same three words, and on
 * the key prefix each one implies.
 */
export type AllocationSubjectType = 'person' | 'org' | 'resource';

/**
 * The prefix that identifies a subject in the two collections that hang off it: the
 * `addresses.parentKey` (`org.DIVsVOA0…`) and the bare avatar document id (`avatars/org.…`).
 * Both use the same shape, which is why one map serves both — see `address-model` and the
 * avatar-doc-id rule in `allocate-tenant.ts`.
 */
export const ALLOCATION_SUBJECT_PREFIX: Record<AllocationSubjectType, string> = {
  person: 'person',
  org: 'org',
  resource: 'resource',
};

/** `person.kaiser`, `org.DIVsVOA0…` — the parentKey / avatar id of a subject. */
export function allocationSubjectKey(modelType: AllocationSubjectType, okey: string): string {
  return `${ALLOCATION_SUBJECT_PREFIX[modelType]}.${okey}`;
}

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
