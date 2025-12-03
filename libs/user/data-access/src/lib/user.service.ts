import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { UserCollection, UserModel } from '@bk2/shared-models';
import { findAllByField, findByField, findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getUserIndex, getUserIndexInfo } from '@bk2/user-util';

@Injectable({
    providedIn: 'root'
})
export class UserService  {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /* ---------------------- Standard CRUD operations -------------------------------*/
  /**
   * Save a new document into the database and return its uid.
   * The document ID should be assigned to the value of the firebase user id (for both bkey and document id).
   * @param user the new document to save
   * @param currentUser the current user who performs the operation
   * @returns a Promise of the key of the newly stored model or undefined if the operation
   */
  public async create(user: UserModel, currentUser?: UserModel): Promise<string | undefined> {
    user.index = this.getIndex(user);
    return await this.firestoreService.createModel<UserModel>(UserCollection, user, '@user.operation.create', currentUser);
  }

  /**
   * Lookup an object by its primary key in the database and return an Observable of the document.
   * The document id of the user collection is the same as the firebase user id.
   * @param key the document id of the object in the database
   * @return an Observable of the UserModel or undefined if not found
   */
  public read(key: string | undefined | null): Observable<UserModel | undefined> {
    return findByKey<UserModel>(this.list(), key);
  }

  /**
   * Lookup users by their loginEmail. LoginEmail should be unique, therefore there should be one or none element in the result.
   * @param loginEmail the email address that the user is registered with
   * @returns the user with the given email address or undefined if there was an error.
   */
  public readByLoginEmail(loginEmail: string | undefined | null): Observable<UserModel | undefined> {
    return findByField<UserModel>(this.list(), 'loginEmail', loginEmail);
  }

  /**
   * Lookup users by their person key. Normally, a single person should only have one single user account.
   * But there are situations where a person has multiple user accounts (e.g. for testing purposes).
   * @param personKey the document id of the PersonModel that relates to this user
   * @returns the user that has the given personKey registered.
   */
  public readByPersonKey(personKey: string): Observable<UserModel[] | undefined> {
    return findAllByField<UserModel>(this.list(), 'personKey', personKey);
  }

  /**
   * Update a document with the values of the given document.
   * Update is for non-destructive updates, ie. it updates the current value
   * within the database with the new value specified as the parameter.s
   * Dest
   * @param user the new user values
   * @param currentUser the current user who performs the operation
   * @param confirmMessage an optional confirmation message to show in the UI
   * @returns a Promise of the key of the updated model or undefined if the operation failed
   */
  public async update(user: UserModel, currentUser?: UserModel, confirmMessage = '@user.operation.update'): Promise<string | undefined> {
    user.index = this.getIndex(user);
    return await this.firestoreService.updateModel<UserModel>(UserCollection, user, false, confirmMessage, currentUser);  
  }

  /**
   * Delete the user. We are not actually deleting the user. We are just archiving it.
   * @param user: the user to delete
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(user: UserModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<UserModel>(UserCollection, user, '@user.operation.delete', currentUser);
  }

  /**
   * Return all documents in the collection as an Observable.
   */
  public list(orderBy = 'loginEmail', sortOrder = 'asc'): Observable<UserModel[]> {
    return this.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index  --------------------------------*/
  public getIndex(user: UserModel): string {
    return getUserIndex(user);
  }

  public getIndexInfo(): string {
    return getUserIndexInfo();
    }
}
