import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** The five landing-page worlds a partner sells into (C3 §4). */
export type PartnerSegment = 'club' | 'alumni' | 'steg' | 'coop' | 'kmu';

/**
 * One business-role contact per reported tenant (C2 §7) — **never member data**. The partner's
 * end customers are their data subjects, not bkaiser's; this is the person bkaiser may write to
 * about the contract, and bkaiser is an independent controller for it, not a sub-processor.
 */
export interface MeteringContact {
  name: string;
  role: string;
  email: string;
}

/**
 * `meteringRecords/{partnerKey}_{tenantId}_{period}` — one pushed measurement, in tenant `kring`.
 *
 * **The doc id is the idempotency key** (C3 §6): a retried push overwrites its own record instead
 * of doubling the month. Anything derived from a random id would need a query-then-decide, which
 * is exactly the race a retry storm produces.
 *
 * The counts arrive already computed under the pricing spec's §9.1 rules, because that logic ships
 * INSIDE the product (C3 §2): a partner must not be able to reinterpret "privileged". What stays
 * bkaiser-side is the hysteresis — a band, unlike a count, is a decision about two months.
 */
export class MeteringRecordModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public partnerKey = '';
  /** Opaque to bkaiser, unique within the partner (C3 §4). */
  public tenantId = '';
  /** `yyyy-mm` — the month the measurement describes, not the month it arrived. */
  public period = '';

  public customerName = '';
  public segment: PartnerSegment = 'club';

  /** Accounts that are neither archived nor disabled, on the last day of `period`. */
  public totalUsers = 0;
  /** Subset of `totalUsers` holding one of the eight privileged roles — counts double. */
  public privilegedUsers = 0;
  /** Stable add-on ids (`ADD_ON_PRICES`), which count toward the 10 % (pricing §8.2). */
  public addOns: string[] = [];

  public version = '';
  public activationDate = '';
  public contact: MeteringContact = { name: '', role: '', email: '' };

  /** When bkaiser received it — server-stamped, never taken from the payload. */
  public receivedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MeteringRecordCollection = 'meteringRecords';
export const MeteringRecordModelName = 'meteringRecord';

/**
 * `commissionEntries/{partnerKey}_{tenantId}_{period}` — one ledger line, in tenant `kring`.
 *
 * **Per tenant, not per partner**, for two reasons: the band table is concave and stepped, so a
 * partner-level total cannot be decomposed back into tenants (C3 §2); and `band` has to be stored
 * per line to stay traceable when the table later changes (C3 §7). A partner's monthly commission
 * is the sum of their lines for that period.
 */
export class CommissionEntryModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public partnerKey = '';
  public tenantId = '';
  public period = '';

  /** Weighted users behind the band: `totalUsers + privilegedUsers` (privileged count double). */
  public weightedUsers = 0;
  /** The band id (`KringM`, …) AS APPLIED, after hysteresis — not recomputed from `weightedUsers`. */
  public band = '';
  /** CHF per month, all excl. MWST. */
  public bandPrice = 0;
  public addOnTotal = 0;
  public subtotal = 0;
  /** 10 % of `subtotal`, rounded to five centimes. */
  public commission = 0;

  public computedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CommissionEntryCollection = 'commissionEntries';
export const CommissionEntryModelName = 'commissionEntry';
