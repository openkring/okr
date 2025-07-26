import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";

import { DateFormat, getFullPersonName, getSystemQuery, getTodayStr } from "@bk2/shared/util-core";
import { CommentCollection, CommentModel, UserModel } from "@bk2/shared/models";
import { ENV } from "@bk2/shared/config";
import { FirestoreService } from "@bk2/shared/data-access";

import { createComment } from "@bk2/comment/util";
import { error } from "@bk2/shared/util-angular";

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
   * @param collectionName the  name of the parent collection
   * @param parentKey the key of the parent object
   * @param comment the new comment to save
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created comment or undefined if the operation failed
   */
  public async create(collectionName: string, parentKey: string, comment: string, currentUser?: UserModel): Promise<string | undefined> {
    if (!currentUser) {
      return error(undefined, 'CommentService.create: inconsistent app state: there is no current user.');
    }
    const _comment = createComment(currentUser.personKey, getFullPersonName(currentUser.firstName, currentUser.lastName), comment, collectionName, parentKey, this.tenantId);
    _comment.creationDate = getTodayStr(DateFormat.StoreDateTime);
    _comment.index = `${collectionName}/${parentKey} ${_comment.creationDate}`;
    // Save the comment to the database, but do neither set the confirmMessage nor the currentUser to avoid adding a comment to the comment.
    return await this.firestoreService.createModel<CommentModel>(`${collectionName}/${parentKey}/${CommentCollection}`, _comment);
  }
  
  /**
   * Return all comments in the collection as an Observable.
   * @param collectionName the  name of the parent collection
   * @param parentKey the key of the parent object
   */
  public list(collectionName: string, parentKey: string): Observable<CommentModel[]> {
    if (collectionName?.length === 0 || parentKey?.length === 0) {
      return of([]);
    }
    return this.firestoreService.searchData<CommentModel>(`${collectionName}/${parentKey}/${CommentCollection}`, getSystemQuery(this.tenantId), 'creationDate', 'desc');
  }
}