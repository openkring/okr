import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";

import { DateFormat, die, getFullPersonName, getTodayStr } from "@bk2/shared/util";
import { CommentCollection, CommentModel } from "@bk2/shared/models";
import { createModel, getSystemQuery, searchData } from "@bk2/shared/data-access";
import { FIRESTORE } from "@bk2/shared/config";
import { createComment } from "@bk2/comment/util";
import { AppStore } from "@bk2/auth/feature";

@Injectable({
    providedIn: 'root'
})
export class CommentService {
  private readonly firestore = inject(FIRESTORE);
  private readonly appStore = inject(AppStore);

  private readonly tenantId = this.appStore.env.owner.tenantId;

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
  public async create(collectionName: string, parentKey: string, comment: string): Promise<string> {
    const _user = this.appStore.currentUser() ?? die('CommentService.createComment: inconsistent app state: there is no current user.');
    const _commentModel = createComment(_user.personKey, getFullPersonName(_user.firstName, _user.lastName), comment, collectionName, parentKey, this.tenantId);
    _commentModel.creationDate = getTodayStr(DateFormat.StoreDateTime);
    _commentModel.index = `${collectionName}/${parentKey} ${_commentModel.creationDate}`;
    return await createModel(this.firestore, `${collectionName}/${parentKey}/${CommentCollection}`, _commentModel, this.appStore.env.owner.tenantId);
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
    return searchData(this.firestore, `${collectionName}/${parentKey}/${CommentCollection}`, getSystemQuery(this.tenantId), 'creationDate', 'desc') as Observable<CommentModel[]>;
  }
}