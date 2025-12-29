import { CommentModel } from "@bk2/shared-models";
import { DateFormat, generateRandomString, getTodayStr } from "@bk2/shared-util-core";

/* ---------------------- Model  -------------------------------*/
 /**
   * Convenience function to create a new CommentModel with given values.
   * @param authorKey 
   * @param authorName 
   * @param commentStr 
   * @param parentKey modelType.key of the parent model
   * @param tenant
   * @returns the created CommentModel
   */
export function createComment(authorKey: string, authorName: string, commentStr: string, parentKey: string, tenant: string): CommentModel {
  const comment = new CommentModel();
  comment.bkey = generateRandomString(20);
  comment.authorKey = authorKey;
  comment.authorName = authorName;
  comment.creationDateTime = getTodayStr(DateFormat.StoreDateTime);
  comment.parentKey = parentKey;
  comment.description = commentStr;
  comment.isArchived = false;
  comment.tenants = [tenant];
  comment.index = getCommentIndex(comment);
  return comment;
}

// as long as we don't show list of comments, we don't need an index
export function getCommentIndex(comment: CommentModel): string {
  return `an:${comment.authorName}, cd:${comment.creationDateTime}, pk:${comment.parentKey}`;
}

export function getCommentIndexInfo(): string {
  return 'an:authorname, cd:creationDateTime, pk:parentKey';
}