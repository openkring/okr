import { DEFAULT_NAME, DEFAULT_NOTES } from '@bk2/shared-constants';
import { FolderModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

/*-------------------------- factory --------------------------------*/
/**
 * Create a new FolderModel populated with the given values.
 * @param tenantId the tenant the folder belongs to
 * @param name the display name of the folder
 * @param parentKeys optional list of parent FolderModel bkeys for hierarchy nesting
 */
export function newFolderModel(tenantId: string, name = DEFAULT_NAME, parentKeys: string[] = []): FolderModel {
  const folder = new FolderModel(tenantId);
  folder.name = name;
  folder.title = name;
  folder.description = DEFAULT_NOTES;
  folder.parents = parentKeys;
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
