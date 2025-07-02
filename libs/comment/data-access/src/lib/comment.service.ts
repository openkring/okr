import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";

import { createModel, DateFormat, die, getFullPersonName, getSystemQuery, getTodayStr, searchData } from "@bk2/shared/util-core";
import { CommentCollection, CommentModel, UserModel } from "@bk2/shared/models";
import { ENV, FIRESTORE } from "@bk2/shared/config";
import { createComment } from "@bk2/comment/util";

@Injectable({
    providedIn: 'root'
})
export class CommentService {
  private readonly firestore = inject(FIRESTORE);
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
   */
  public async create(collectionName: string, parentKey: string, comment: string, currentUser?: UserModel): Promise<string> {
    const _user = currentUser ?? die('CommentService.createComment: inconsistent app state: there is no current user.');
    const _comment = createComment(_user.personKey, getFullPersonName(_user.firstName, _user.lastName), comment, collectionName, parentKey, this.tenantId);
    _comment.creationDate = getTodayStr(DateFormat.StoreDateTime);
    _comment.index = `${collectionName}/${parentKey} ${_comment.creationDate}`;
    return await createModel(this.firestore, `${collectionName}/${parentKey}/${CommentCollection}`, _comment, this.tenantId);
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
    return searchData<CommentModel>(this.firestore, `${collectionName}/${parentKey}/${CommentCollection}`, getSystemQuery(this.tenantId), 'creationDate', 'desc');
  }
}