import { AvatarInfo, DefaultResourceInfo, ResourceInfo } from '@bk2/shared-models';
import { getTodayStr } from '@bk2/shared-util-core';
import { DEFAULT_CURRENCY, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE } from '@bk2/shared-constants';

export type TransferFormModel = {
  bkey: string,
  name: string,
  tags: string,
  notes: string

  subjects: AvatarInfo[]; // list of subjects, e.g. person or org or account
  objects: AvatarInfo[]; // list of objects, e.g. person or org or account
  resource: ResourceInfo;

  // transfer
  dateOfTransfer: string,
  type: string,
  state: string,
  label: string, // a label for a custom transfer type

  // price
  price: number,
  currency: string,
  periodicity: string
};

export const TRANSFER_FORM_SHAPE: TransferFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
  subjects: [],
  objects: [], 
  resource: DefaultResourceInfo,

  // transfer
  dateOfTransfer: getTodayStr(),
  type: DEFAULT_TRANSFER_TYPE,
  state: DEFAULT_TRANSFER_STATE,
  label: DEFAULT_LABEL,
  
  // price
  price: DEFAULT_PRICE,
  currency: DEFAULT_CURRENCY,
  periodicity: DEFAULT_PERIODICITY
};
