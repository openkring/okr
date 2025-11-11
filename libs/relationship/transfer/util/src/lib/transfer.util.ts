import { DefaultResourceInfo, OrgModel, PersonModel, ResourceInfo, ResourceModel, TransferModel } from '@bk2/shared-models';
import { addIndexElement, getAvatarInfoArray, getAvatarKeys, getAvatarNames, getTodayStr, isType } from '@bk2/shared-util-core';

import { TransferFormModel } from './transfer-form.model';
import { DEFAULT_CURRENCY, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TASK_STATE, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE } from '@bk2/shared-constants';

export function newTransferFormModel(subject?: PersonModel | OrgModel, subjectModelType?: string, object?: PersonModel | OrgModel, objectModelType?: string, resource?: ResourceModel): TransferFormModel {
  return {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    subjects: getAvatarInfoArray(subject, subjectModelType),
    objects: getAvatarInfoArray(object, objectModelType),
    resource: getResourceInfo(resource),

    // transfer
    dateOfTransfer: getTodayStr(),
    type: DEFAULT_TRANSFER_TYPE,
    state: DEFAULT_TASK_STATE,
    label: DEFAULT_LABEL, // a label for a custom transfer type

    // price
    price: DEFAULT_PRICE,
    currency: DEFAULT_CURRENCY,
    periodicity: DEFAULT_PERIODICITY,
  };
}

function getResourceInfo(resource?: ResourceModel): ResourceInfo {
  if (!resource) return DefaultResourceInfo;
  return {
    key: resource.bkey,
    name: resource.name,
    type: resource.type,
    subType: resource.subType,
  };
}

export function convertTransferToForm(transfer: TransferModel | undefined): TransferFormModel {
  if (!transfer) return newTransferFormModel();
  return {
    bkey: transfer.bkey ?? DEFAULT_KEY,
    name: transfer.name ?? DEFAULT_NAME,
    tags: transfer.tags ?? DEFAULT_TAGS,
    notes: transfer.notes ?? DEFAULT_NOTES,

    subjects: transfer.subjects ?? [],
    objects: transfer.objects ?? [],
    resource: transfer.resource ?? DefaultResourceInfo,

    // transfer
    dateOfTransfer: transfer.dateOfTransfer ?? getTodayStr(),
    type: transfer.type ?? DEFAULT_TRANSFER_TYPE,
    state: transfer.state ?? DEFAULT_TRANSFER_STATE,
    label: transfer.label ?? DEFAULT_LABEL,

    // price
    price: transfer.price ?? DEFAULT_PRICE,
    currency: transfer.currency ?? DEFAULT_CURRENCY,
    periodicity: transfer.periodicity ?? DEFAULT_PERIODICITY,
  };
}

export function convertFormToTransfer(transfer: TransferModel | undefined, vm: TransferFormModel, tenantId: string): TransferModel {
  if (!transfer) {
    transfer = new TransferModel(tenantId);
    transfer.bkey = vm.bkey ?? DEFAULT_KEY;
  }
  transfer.tags = vm.tags ?? DEFAULT_TAGS;
  transfer.notes = vm.notes ?? DEFAULT_NOTES;
  transfer.name = vm.name ?? DEFAULT_NAME;

  transfer.subjects = vm.subjects ?? [];
  transfer.objects = vm.objects ?? [];
  transfer.resource = vm.resource ?? DefaultResourceInfo;

  // transfer
  transfer.dateOfTransfer = vm.dateOfTransfer ?? getTodayStr();
  transfer.type = vm.type ?? DEFAULT_TRANSFER_TYPE;
  transfer.state = vm.state ?? DEFAULT_TRANSFER_STATE;
  transfer.label = vm.label ?? DEFAULT_LABEL;

  // price
  transfer.price = vm.price ?? DEFAULT_PRICE;
  transfer.currency = vm.currency ?? DEFAULT_CURRENCY;
  transfer.periodicity = vm.periodicity ?? DEFAULT_PERIODICITY;

  return transfer;
}

export function isTransfer(transfer: unknown, tenantId: string): transfer is TransferModel {
  return isType(transfer, new TransferModel(tenantId));
}

/************************************************* Search Index ********************************************************** */
export function getName(modelType: 'person' | 'org', name1: string, name2: string): string {
  // tbd: consider NameDisplay
  if (modelType === 'person') {
    return `${name1} ${name2}`;
  } else {
    return name2;
  }
}

/************************************************* Search Index ********************************************************** */
export function getTransferSearchIndex(transfer: TransferModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sn', getAvatarNames(transfer.subjects));
  _index = addIndexElement(_index, 'sk', getAvatarKeys(transfer.subjects));
  _index = addIndexElement(_index, 'on', getAvatarNames(transfer.objects));
  _index = addIndexElement(_index, 'ok', getAvatarKeys(transfer.objects));
  _index = addIndexElement(_index, 'rn', transfer.resource.name);
  _index = addIndexElement(_index, 'rk', transfer.resource.key);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getTransferSearchIndexInfo(): string {
  return 'sn:subjectName sk:subjectKey ok:objectKey on:objectName rk:resourceKey rn:resourceName';
}
