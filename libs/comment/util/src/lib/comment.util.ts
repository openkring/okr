import { Firestore } from "firebase/firestore";

import { DateFormat, getFullPersonName, getTodayStr, warn } from "@bk2/shared/util";
import { CommentCollection, CommentModel, UserModel } from "@bk2/shared/models";
import { createModel } from "@bk2/shared/data";

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

export async function saveComment(firestore: Firestore, tenantId: string, currentUser: UserModel | undefined, collectionName: string, parentKey: string | undefined, comment: string): Promise<void> {
  if (!currentUser?.bkey || !parentKey) {
    warn('comment.util.saveComment: inconsistent app state: current user, its key or parentkey is missing; we are not saving the initial comment.');
    return;
  }
  const _comment = createComment(currentUser.bkey, getFullPersonName(currentUser.firstName, currentUser.lastName), comment, collectionName, parentKey, tenantId);
  await createModel(firestore, `${collectionName}/${parentKey}/${CommentCollection}`, _comment, tenantId);
}

export function getCommentIndex(comment: CommentModel): string {
  return `an:${comment.authorName}, cd:${comment.creationDate}, pc:${comment.parentCollection}`;
}

