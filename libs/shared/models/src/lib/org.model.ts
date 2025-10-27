import { AddressableModel, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { OrgType } from './enums/org-type.enum';

/**
 * An organization or company.
 * Groups are also organizations (with OrgType=Group). They can be used on different levels, e.g. as a department or a team.
 * Hierarchies or orgcharts can be built using memberships.
 */
export class OrgModel implements BkModel, NamedModel, AddressableModel, SearchableModel, TaggedModel {
  public bkey = '';
  public name = '';
  public type = OrgType.Association;
  public dateOfFoundation = '';
  public dateOfLiquidation = '';

  public taxId = '';
  public notes = '';
  public tags = '';
  public bexioId = '';
  public membershipCategoryKey = 'mcat_default';

  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  public fav_email = '';
  public fav_phone = '';
  public fav_street_name = '';
  public fav_street_number = '';
  public fav_zip_code = '';
  public fav_city = '';
  public fav_country_code = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const OrgCollection = 'orgs';
