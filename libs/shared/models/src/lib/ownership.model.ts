import { DEFAULT_COUNT, DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_OCAT, DEFAULT_OSTATE, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A person or org owns a resource, e.g. a rowing boat or an account.
 *
 * Person|Org            owns/rents/leases|uses|provides      Resource|RowingBoat|Account
 *
 * OwnershipType: Possession, Usage, Rent, Lease
 *
 * Examples:
 * - ownership of a rowing boat
 * - rental of a storage place
 * - lease of a car
 * - usage of a resource (e.g. a room)
 */
export class OwnershipModel implements BkModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the trip

  // the owner person or org
  public ownerKey = DEFAULT_KEY;
  public ownerName1 = DEFAULT_NAME; // e.g. firstName of person
  public ownerName2 = DEFAULT_NAME; // e.g. lastname of person or company name
  public ownerModelType: 'person' | 'org' = 'person'; 
  public ownerType = DEFAULT_GENDER;

  // the owned resource
  public resourceKey = DEFAULT_KEY;
  public resourceName = DEFAULT_NAME;
  public resourceModelType: 'resource' | 'account' = 'resource';
  public resourceType = DEFAULT_RESOURCE_TYPE;
  public resourceSubType = DEFAULT_RBOAT_TYPE; 

  // ownership
  public validFrom = DEFAULT_DATE; // membership: entryDate
  public validTo = DEFAULT_DATE; // membership: exitDate
  public ownershipCategory = DEFAULT_OCAT;
  public ownershipState = DEFAULT_OSTATE;

  public count = DEFAULT_COUNT; // e.g. how many of the same resources are owned
  public order = 1; // e.g. relevant for waiting list (state applied)

  public price = DEFAULT_PRICE; // overwrites the default ownership price from OwnershipCategories[ownershipCategory].price
  public currency = DEFAULT_CURRENCY;
  public periodicity = 'yearly';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const OwnershipCollection = 'ownerships';
export const OwnershipModelName = 'ownership';
