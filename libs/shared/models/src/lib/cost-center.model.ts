import { DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export type CostCenterType = 'root' | 'group' | 'leaf';

/**
 * A Kostenstelle (cost centre) — WHERE a cost arises and who is responsible (spec 1.65).
 * A tree per accounting tenant like the chart of accounts; booking lines point at leaves only.
 * Archived, never deleted, once a line references it.
 */
export class CostCenterModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public id = DEFAULT_ID;                     // display number, e.g. '310'
  public parentKey = DEFAULT_KEY;             // '' = root
  public type: CostCenterType = 'leaf';
  public responsibilityKey = '';              // → responsibilities/{okey}; '' = treasurer only
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const CostCenterCollection = 'cost-centers';
export const CostCenterModelName = 'costCenter';
