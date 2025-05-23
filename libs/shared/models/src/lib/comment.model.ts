import { BkModel, SearchableModel } from "./base.model";

export class CommentModel implements BkModel, SearchableModel {
  bkey = '';
  index = '';
  authorKey = '';
  authorName = '';
  creationDate = '';
  parentKey = '';
  parentCollection = '';
  description = '';
  isArchived = false;
  tenants: string[] = [];
}

export const CommentCollection = 'comments';