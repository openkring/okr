import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { CommentCollection, CommentModel, UserModel } from "@bk2/shared-models";
import { error } from "@bk2/shared-util-angular";
import { getFullName, getSystemQuery } from "@bk2/shared-util-core";

import { createComment } from "@bk2/comment-util";

@Injectable({
    providedIn: 'root'
})
export class CommentService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  private readonly tenantId = this.env.tenantId;

  /* ---------------------- CRUD operations -------------------------------*/

  /**
   * Comments can not be deleted nor edited. They can only be created.
   * The only way to change or delete a comment is directly in the database.
   * Comment entries in the description property can be written in i18n notation (starting with @, e.g. @comment.operation.initial.conf).
   * Such a comment is translated in the template view.
   */
  /**
   * Save a new comment into the database to a given model.
   * @param parentCollection the  name of the parent collection
   * @param parentKey the key of the parent object (format: modelType.key)
   * @param message the new comment to save
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created comment or undefined if the operation failed
   */
  public async create(parentKey: string, message: string, currentUser?: UserModel): Promise<string | undefined> {
    if (!currentUser) {
      return error(undefined, 'CommentService.create: inconsistent app state: there is no current user.');
    }
    const comment = createComment(currentUser.bkey, getFullName(currentUser.firstName, currentUser.lastName), message, parentKey, this.tenantId);
    // Save the comment to the database, but do neither set the confirmMessage nor the currentUser to avoid adding a comment to the comment.
    return await this.firestoreService.createModel<CommentModel>(`${CommentCollection}`, comment);
  }
  
  /**
   * Return all comments for a given model as an Observable.
   * @param parentKey the key of the parent object (modelType.key)
   */
  public list(parentKey: string): Observable<CommentModel[]> {
    if (parentKey?.length === 0) {
      return of([]);
    }
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    return this.firestoreService.searchData<CommentModel>(`${CommentCollection}`, query, 'creationDateTime', 'desc');
  }
}