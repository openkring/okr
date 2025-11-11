import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AddressableModel, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * An organization or company.
 * Groups are also organizations (with OrgType=Group). They can be used on different levels, e.g. as a department or a team.
 * Hierarchies or orgcharts can be built using memberships.
 */
export class OrgModel implements BkModel, NamedModel, AddressableModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public name = DEFAULT_NAME;
  public type = DEFAULT_ORG_TYPE;
  public dateOfFoundation = DEFAULT_DATE;
  public dateOfLiquidation = DEFAULT_DATE;

  public taxId = DEFAULT_ID;
  public notes = DEFAULT_NOTES;
  public tags = DEFAULT_TAGS;
  public bexioId = DEFAULT_ID;
  public membershipCategoryKey = 'mcat_default';

  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public favEmail = '';
  public favPhone = '';
  public favStreetName = '';
  public favStreetNumber = '';
  public favZipCode = '';
  public favCity = '';
  public favCountryCode = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const OrgCollection = 'orgs';
