import { CommentModel } from "@bk2/shared-models";
import { DateFormat, getTodayStr } from "@bk2/shared-util-core";

/* ---------------------- Model  -------------------------------*/
 /**
   * Convenience function to create a new CommentModel with given values.
   * @param authorKey 
   * @param authorName 
   * @param commentStr 
   * @returns the created CommentModel
   */
export function createComment(authorKey: string, authorName: string, commentStr: string, parentCollection: string, parentKey: string, tenant: string): CommentModel {
  const _comment = new CommentModel();
  _comment.bkey = '';
  _comment.authorKey = authorKey;
  _comment.authorName = authorName;
  _comment.creationDate = getTodayStr(DateFormat.StoreDate);
  _comment.parentKey = parentKey;
  _comment.parentCollection = parentCollection;
  _comment.description = commentStr;
  _comment.isArchived = false;
  _comment.tenants = [tenant];
  _comment.index = getCommentIndex(_comment);
  return _comment;
}

export function getCommentIndex(comment: CommentModel): string {
  return `an:${comment.authorName}, cd:${comment.creationDate}, pc:${comment.parentCollection} pk:${comment.parentKey}`;
}

