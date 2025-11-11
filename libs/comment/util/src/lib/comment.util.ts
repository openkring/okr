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
  const comment = new CommentModel();
  comment.bkey = '';
  comment.authorKey = authorKey;
  comment.authorName = authorName;
  comment.creationDate = getTodayStr(DateFormat.StoreDate);
  comment.parentKey = parentKey;
  comment.parentCollection = parentCollection;
  comment.description = commentStr;
  comment.isArchived = false;
  comment.tenants = [tenant];
  comment.index = getCommentIndex(comment);
  return comment;
}

export function getCommentIndex(comment: CommentModel): string {
  return `an:${comment.authorName}, cd:${comment.creationDate}, pc:${comment.parentCollection} pk:${comment.parentKey}`;
}

