import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { AccountType, GenderType, ModelType, OrgType, Periodicity, ResourceType, RowingBoatType } from '@bk2/shared-models';

export type OwnershipNewFormModel = DeepPartial<{
  ownerKey: string,
  ownerName1: string,
  ownerName2: string,
  ownerModelType: ModelType,    // Person or Org
  ownerType: GenderType | OrgType,

  resourceKey: string,
  resourceName: string,
  resourceModelType: ModelType, // Resource or Account
  resourceType: ResourceType | AccountType,
  resourceSubType: RowingBoatType,

  validFrom: string,
  validTo: string,
  ownershipCategory: string,
  ownershipState: string,
  
  count: string,
  priority: number,

  price: number,
  currency: string,
  periodicity: Periodicity,
}>;

export const ownershipNewFormModelShape: DeepRequired<OwnershipNewFormModel> = {
  ownerKey: '',
  ownerName1: '',
  ownerName2: '',
  ownerModelType: ModelType.Person,
  ownerType: GenderType.Male,

  resourceKey: '',
  resourceName: '',
  resourceModelType: ModelType.Resource,
  resourceType: ResourceType.Key,
  resourceSubType: RowingBoatType.b1x,

  validFrom: '',
  validTo: '',
  ownershipCategory: 'use',
  ownershipState: 'active',

  count: '1',
  priority: 0,

  price: 0,
  currency: 'CHF',
  periodicity: Periodicity.Yearly,
};
