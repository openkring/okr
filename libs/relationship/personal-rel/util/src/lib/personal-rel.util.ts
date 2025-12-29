import { PersonalRelModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given personal relationship based on its values.
 * @param personalRel the personal relationship for which to create the index
 * @returns the index string
 */
export function getPersonalRelIndex(personalRel: PersonalRelModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sk', personalRel.subjectKey);
  _index = addIndexElement(_index, 'sn', personalRel.subjectFirstName + ' ' + personalRel.subjectLastName);
  _index = addIndexElement(_index, 'ok', personalRel.objectKey);
  _index = addIndexElement(_index, 'on', personalRel.objectFirstName + ' ' + personalRel.objectLastName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getPersonalRelIndexInfo(): string {
  return 'sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName';
}
