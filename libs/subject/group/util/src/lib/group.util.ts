import { GroupModel } from '@bk2/shared-models';

import { addIndexElement } from '@bk2/shared-util-core';



/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given group based on its values.
 * @param group the group to generate the index for 
 * @returns the index string
 */
export function getGroupIndex(group: GroupModel): string {
  let index = '';
  index = addIndexElement(index, 'n', group.name);
  index = addIndexElement(index, 'id', group.id);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getGroupIndexInfo(): string {
  return 'n:name id:id';
}