import { DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel } from './base.model';

export class CommentModel implements BkModel, SearchableModel {
  bkey = DEFAULT_KEY;
  index = DEFAULT_INDEX;
  authorKey = DEFAULT_KEY;
  authorName = DEFAULT_NAME;
  creationDateTime = DEFAULT_DATETIME;
  parentKey = DEFAULT_KEY;
  description = DEFAULT_NOTES;
  isArchived = false;
  tenants: string[] = DEFAULT_TENANTS;
}

export const CommentCollection = 'comments';
export const CommentModelName = 'comment';