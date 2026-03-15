import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A Folder groups DocumentModels together.
 * Documents reference their folders via DocumentModel.folderKeys (array of FolderModel bkeys).
 * Folders reference their parent folders via FolderModel.parents (array of FolderModel bkeys),
 * enabling hierarchical nesting.
 *
 * GroupView implicitly creates a FolderModel with bkey = groupKey when files are first accessed.
 */
export class FolderModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public name = DEFAULT_NAME;
  public description = DEFAULT_NOTES;
  public title = DEFAULT_TITLE;
  public parents: string[] = [];  // FolderModel bkeys — ancestor folders for hierarchy nesting
  public tags = DEFAULT_TAGS;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const FolderCollection = 'folders';
export const FolderModelName = 'folder';
