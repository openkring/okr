import { DEFAULT_NAME, DEFAULT_NOTES } from '@okr/shared-constants';
import { FolderModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

/*-------------------------- factory --------------------------------*/
/**
 * Create a new FolderModel populated with the given values.
 * @param tenantId the tenant the folder belongs to
 * @param name the display name of the folder
 * @param parentKeys optional list of parent FolderModel okeys for hierarchy nesting
 * @param ownerKey personKey of the creating user — owner may edit/delete the folder
 */
export function newFolderModel(tenantId: string, name = DEFAULT_NAME, parentKeys: string[] = [], ownerKey = ''): FolderModel {
  const folder = new FolderModel(tenantId);
  folder.name = name;
  folder.title = name;
  folder.description = DEFAULT_NOTES;
  folder.parents = parentKeys;
  folder.ownerKey = ownerKey;
  return folder;
}

/*-------------------------- i18n title --------------------------------*/
/**
 * Return the translation key for a folder operation label.
 * @param operation e.g. 'create', 'update', 'delete'
 */
export function getFolderTitle(operation: string): string {
  return `folder.operation.${operation}.label`;
}

/*-------------------------- search index --------------------------------*/
/**
 * Build the search index string for a FolderModel.
 * @param folder the folder to index
 */
export function getFolderIndex(folder: FolderModel): string {
  let index = '';
  index = addIndexElement(index, 'n', folder.name);
  index = addIndexElement(index, 'd', folder.description);
  return index;
}

/**
 * Returns a human-readable description of the index structure.
 */
export function getFolderIndexInfo(): string {
  return 'n:ame d:escription';
}
