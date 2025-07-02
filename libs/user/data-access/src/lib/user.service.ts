import { ToastController } from '@ionic/angular';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { UserCollection, UserModel } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';

import { saveComment } from '@bk2/comment/util';
import { createModel, findAllByField, findByField, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';
import { bkTranslate } from '@bk2/shared/i18n';

@Injectable({
    providedIn: 'root'
})
export class UserService  {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly tenantId = this.env.tenantId;

  /* ---------------------- Standard CRUD operations -------------------------------*/
  /**
   * Save a new document into the database and return its uid.
   * The document ID is assigned manually to the value of the firebase user id (for both bkey and document id).
   * @param user the new document to save
   */
  public async create(user: UserModel, currentUser?: UserModel): Promise<string | null> {
      try {
      user.index = this.getSearchIndex(user);
      const _key = await createModel(this.firestore, UserCollection, user, this.tenantId);
      await confirmAction(bkTranslate('@user.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, UserCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@user.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Lookup an object by its primary key in the database and return an Observable of the document.
   * The document id of the user collection is the same as the firebase user id.
   * @param key the document id of the object in the database
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
   */
  public async update(user: UserModel, currentUser?: UserModel, confirmMessage = '@user.operation.update'): Promise<string> {
  try {
      user.index = this.getSearchIndex(user);
      const _key = await updateModel(this.firestore, UserCollection, user);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, UserCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Delete the user. We are not actually deleting the user. We are just archiving it.
   * @param user: the user to delete
   */
  public async delete(user: UserModel, currentUser?: UserModel): Promise<void> {
    user.isArchived = true;
    await this.update(user, currentUser, '@user.operation.delete');
  }

  /**
   * Return all documents in the collection as an Observable.
   */
  public list(orderBy = 'loginEmail', sortOrder = 'asc'): Observable<UserModel[]> {
    return searchData<UserModel>(this.firestore, UserCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- SEARCH --------------------------------*/
  public getSearchIndex(user: UserModel): string {
    return `n:${user.firstName} ${user.lastName} le:${user.loginEmail} pk:${user.personKey}`;
  }

  public getSearchIndexInfo(): string {
    return 'n:ame le:oginEmail pk:personKey';
    }
}
