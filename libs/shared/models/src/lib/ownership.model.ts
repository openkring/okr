import { END_FUTURE_DATE_STR } from "@bk2/shared/config";
import { BkModel, SearchableModel, TaggedModel } from "./base.model";
import { OrgType } from "./enums/org-type.enum";
import { GenderType } from "./enums/gender-type.enum";
import { ResourceType } from "./enums/resource-type.enum";
import { RowingBoatType } from "./enums/rowing-boat-type.enum";
import { AccountType } from "./enums/account-type.enum";
import { Periodicity } from "./enums/periodicity.enum";
import { ModelType } from "./enums/model-type.enum";

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public notes = ''; // a detailed description of the trip

  // the owner person or org
  public ownerKey = '';
  public ownerName1 = '';  // e.g. firstName of person
  public ownerName2 = ''; // e.g. lastname of person or company name
  public ownerModelType? = ModelType.Person | ModelType.Org; 
  public ownerType?: GenderType | OrgType; 

  // the owned resource
  public resourceKey = '';
  public resourceName = ''; 
  public resourceModelType: ModelType = ModelType.Resource;   // Resource or Account
  public resourceType?: ResourceType | AccountType;
  public resourceSubType?: RowingBoatType; // e.g. the boat type (which is a subtype of ResourceType)

  // ownership
  public validFrom = ''; // membership: entryDate
  public validTo = END_FUTURE_DATE_STR;   // membership: exitDate
  public ownershipCategory = 'use';
  public ownershipState = 'active';

  public count = '1';  // e.g. how many of the same resources are owned
  public priority?: number;  // e.g. relevant for waiting list (state applied)

  public price = 0;   // overwrites the default ownership price from OwnershipCategories[ownershipCategory].price
  public currency = 'CHF';
  public periodicity = Periodicity.Yearly;

    constructor(tenantId: string) {
      this.tenants = [tenantId];
  }
}

export const OwnershipCollection = 'ownerships2';
