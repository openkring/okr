import { DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, SearchableModel } from './base.model';

export class CommentModel implements OkrModel, SearchableModel {
  okey = DEFAULT_KEY;
  index = DEFAULT_INDEX;
  authorKey = DEFAULT_KEY;
  authorName = DEFAULT_NAME;
  creationDateTime = DEFAULT_DATETIME;
  parentKey = DEFAULT_KEY;
  description = DEFAULT_NOTES;
  /**
   * okeys of the DocumentModels attached to this comment. The files themselves live in the
   * `documents` collection under the same parent (folderKeys = [parentKey]), so they also show
   * up in the documents accordion; this list only records which of them belong to this comment.
   * Legacy comments written before this field existed read back as `undefined` — always coalesce.
   */
  attachmentKeys: string[] = [];
  isArchived = false;
  tags = '';
  tenants: string[] = DEFAULT_TENANTS;
}

export const CommentCollection = 'comments';
export const CommentModelName = 'comment';