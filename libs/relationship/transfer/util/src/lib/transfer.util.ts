import { DefaultResourceInfo, ModelType, OrgModel, Periodicity, PersonModel, ResourceInfo, ResourceModel, TransferModel, TransferState, TransferType } from "@bk2/shared/models";
import { getAvatarInfoArray, getAvatarKeys, getAvatarNames, getTodayStr, isType } from "@bk2/shared/util";
import { addIndexElement } from '@bk2/shared/data';

import { TransferFormModel } from "./transfer-form.model";

export function newTransferFormModel(subject?: PersonModel | OrgModel, subjectModelType?: ModelType, object?: PersonModel | OrgModel, objectModelType?: ModelType, resource?: ResourceModel): TransferFormModel {
  return {
    bkey: '',
    name: '',
    tags: '',
    notes: '',

    subjects: getAvatarInfoArray(subject, subjectModelType),
    objects: getAvatarInfoArray(object, objectModelType),
    resource: getResourceInfo(resource),

    // transfer
    dateOfTransfer: getTodayStr(),
    type: TransferType.Purchase,
    state: TransferState.Initial,
    label: '', // a label for a custom transfer type

    // price
    price: 0,
    currency: 'CHF',
    periodicity: Periodicity.Once
  };
}

function getResourceInfo(resource?: ResourceModel): ResourceInfo {
  if (!resource) return DefaultResourceInfo;
  return {
    key: resource.bkey,
    name: resource.name,
    type: resource.type,
    subType: resource.subType
  };
}

export function convertTransferToForm(transfer: TransferModel | undefined): TransferFormModel {
  if (!transfer) return newTransferFormModel();
  return {
      bkey: transfer.bkey ?? '',
      name: transfer.name ?? '',
      tags: transfer.tags ?? '',
      notes: transfer.notes ?? '',

      subjects: transfer.subjects ?? [],
      objects: transfer.objects ?? [],
      resource: transfer.resource ?? DefaultResourceInfo,

      // transfer
      dateOfTransfer: transfer.dateOfTransfer ?? getTodayStr(),
      type: transfer.type ?? TransferType.Purchase,
      state: transfer.state ?? TransferState.Initial,
      label: transfer.label ?? '',

      // price
      price: transfer.price ?? 0,
      currency: transfer.currency ?? 'CHF', 
      periodicity: transfer.periodicity ?? Periodicity.Once
  };
}

export function convertFormToTransfer(transfer: TransferModel | undefined, vm: TransferFormModel, tenantId: string): TransferModel {
  if (!transfer) {
    transfer = new TransferModel(tenantId);
    transfer.bkey = vm.bkey ?? '';
  }
  transfer.tags = vm.tags ?? '';
  transfer.notes = vm.notes ?? '';
  transfer.name = vm.name ?? '';

  transfer.subjects = vm.subjects ?? [];
  transfer.objects = vm.objects ?? [];
  transfer.resource = vm.resource ?? DefaultResourceInfo;

  // transfer
  transfer.dateOfTransfer = vm.dateOfTransfer ?? getTodayStr();
  transfer.type = vm.type ?? TransferType.Purchase;
  transfer.state = vm.state ?? TransferState.Initial;
  transfer.label = vm.label ?? '';

  // price
  transfer.price = vm.price ?? 0;
  transfer.currency = vm.currency ?? 'CHF';
  transfer.periodicity = vm.periodicity ?? Periodicity.Once;

  return transfer;
}

export function isTransfer(transfer: unknown, tenantId: string): transfer is TransferModel {
  return isType(transfer, new TransferModel(tenantId));
}

/************************************************* Search Index ********************************************************** */
export function getName(modelType: ModelType, name1: string, name2: string): string {
  // tbd: consider NameDisplay
  if (modelType === ModelType.Person) {
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