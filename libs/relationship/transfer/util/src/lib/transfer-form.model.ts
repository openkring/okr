import { AvatarInfo, DefaultResourceInfo, Periodicity, ResourceInfo, TransferState, TransferType } from '@bk2/shared/models';
import { getTodayStr } from '@bk2/shared/util-core';
import { DeepRequired } from 'ngx-vest-forms';

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
  type: TransferType,
  state: TransferState,
  label: string, // a label for a custom transfer type

  // price
  price: number,
  currency: string,
  periodicity: Periodicity
};

export const transferFormModelShape: DeepRequired<TransferFormModel> = {
  bkey: '',
  name: '',
  tags: '',
  notes: '',
  subjects: [],
  objects: [], 
  resource: DefaultResourceInfo,

  // transfer
  dateOfTransfer: getTodayStr(),
  type: TransferType.Purchase,
  state: TransferState.Initial,
  label: '',
  
  // price
  price: 0,
  currency: 'CHF',
  periodicity: Periodicity.Once
};
