import { TransferModel } from '@bk2/shared-models';
import { addIndexElement, getAvatarKeys, getAvatarNames, isType } from '@bk2/shared-util-core';

export function isTransfer(transfer: unknown, tenantId: string): transfer is TransferModel {
  return isType(transfer, new TransferModel(tenantId));
}

export function getName(modelType: 'person' | 'org', name1: string, name2: string): string {
  // tbd: consider NameDisplay
  if (modelType === 'person') {
    return `${name1} ${name2}`;
  } else {
    return name2;
  }
}

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given organization based on its values.
   * @param org the organization to generate the index for 
   * @returns the index string
   */
export function getTransferIndex(transfer: TransferModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sn', getAvatarNames(transfer.subjects));
  _index = addIndexElement(_index, 'sk', getAvatarKeys(transfer.subjects));
  _index = addIndexElement(_index, 'on', getAvatarNames(transfer.objects));
  _index = addIndexElement(_index, 'ok', getAvatarKeys(transfer.objects));
  _index = addIndexElement(_index, 'rn', transfer.resource.name2);
  _index = addIndexElement(_index, 'rk', transfer.resource.key);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getTransferIndexInfo(): string {
  return 'sn:subjectName sk:subjectKey ok:objectKey on:objectName rk:resourceKey rn:resourceName';
}
