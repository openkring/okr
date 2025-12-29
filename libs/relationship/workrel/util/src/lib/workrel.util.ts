import { WorkrelModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

export function isWorkrel(workrel: unknown, tenantId: string): workrel is WorkrelModel {
  return isType(workrel, new WorkrelModel(tenantId));
}


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given work relationship based on its values.
 * @param workrel the work relationship for which to create the index
 * @returns the index string
 */
export function getWorkrelIndex(workrel: WorkrelModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sk', workrel.subjectKey);
  _index = addIndexElement(_index, 'sn', workrel.subjectName1 + ' ' + workrel.subjectName2);
  _index = addIndexElement(_index, 'ok', workrel.objectKey);
  _index = addIndexElement(_index, 'on', workrel.objectName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getWorkrelIndexInfo(): string {
  return 'sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName';
}
