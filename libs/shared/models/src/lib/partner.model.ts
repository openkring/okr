import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';

/** Where a partner stands contractually. `suspended` is the C2 §13.3 lever, not a soft delete. */
export type PartnerStatus = 'prospect' | 'active' | 'suspended' | 'terminated';

/**
 * `partners/{okey}` — one self-hosting partner company, in tenant `kring` (spec C3 §5).
 *
 * The **operational** record. The partner's commercial identity (address, UID, invoices) lives on
 * an `OrgModel` shared into `bkg`, referenced by `orgKey` — the dual-tenant org C1 §3 verified and
 * `mergeOrgIntoTenant` creates. Duplicating the address here would give the same company two
 * spellings, and the one on the invoice would be the wrong one.
 *
 * `okey` IS the `partnerKey` every metering push authenticates against; never rename it for a live
 * partner, since it is the join key of every `meteringRecords` and `commissionEntries` document.
 */
export class PartnerModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  /** The partner's Org in `bkg` (`tenants: ['bkg','kring']`) — billing address, UID, contacts. */
  public orgKey = '';
  public status: PartnerStatus = 'prospect';

  /** Contract dates as `DateFormat` store strings (`convertDateFormatToString`), never Date objects. */
  public contractStart = '';
  public contractEnd = '';

  /**
   * Last metering push received, whatever it contained. C2 §13.3's termination trigger is an
   * ABSENT heartbeat (notice at 3 days, termination right at 14), so this is updated even for a
   * payload that is rejected — a partner whose pushes arrive but fail validation is a support
   * case, not a breach of the reporting duty.
   */
  public lastHeartbeatAt = '';

  /** openkring version last reported, for the C2 §5 supported-version matrix (current + previous minor). */
  public reportedVersion = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PartnerCollection = 'partners';
export const PartnerModelName = 'partner';
