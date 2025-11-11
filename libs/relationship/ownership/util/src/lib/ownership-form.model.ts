import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { DEFAULT_COUNT, DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_OCAT, DEFAULT_OSTATE, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';

export type OwnershipFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string,

  ownerKey: string,
  ownerName1: string,
  ownerName2: string,
  ownerModelType: 'person' | 'org',
  ownerType: string,

  resourceKey: string,
  resourceName: string,
  resourceModelType: 'resource' | 'account',
  resourceType: string,
  resourceSubType: string,

  validFrom: string,
  validTo: string,
  ownershipCategory: string,
  ownershipState: string,
  
  count: string,
  order: number,

  price: number,
  currency: string,
  periodicity: string,
}>;

export const ownershipFormModelShape: DeepRequired<OwnershipFormModel> = {
  bkey: DEFAULT_KEY,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,

  ownerKey: DEFAULT_KEY,
  ownerName1: DEFAULT_NAME,
  ownerName2: DEFAULT_NAME,
  ownerModelType: 'person',
  ownerType: DEFAULT_GENDER,

  resourceKey: DEFAULT_KEY,
  resourceName: DEFAULT_NAME,
  resourceModelType: 'resource',
  resourceType: DEFAULT_RESOURCE_TYPE,
  resourceSubType: DEFAULT_RBOAT_TYPE,

  validFrom: DEFAULT_DATE,
  validTo: DEFAULT_DATE,
  ownershipCategory: DEFAULT_OCAT,
  ownershipState: DEFAULT_OSTATE,

  count: DEFAULT_COUNT,
  order: 1,

  price: DEFAULT_PRICE,
  currency: DEFAULT_CURRENCY,
  periodicity: 'yearly',
};
