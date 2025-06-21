import { ToastController } from '@ionic/angular';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { UserCollection, UserModel } from '@bk2/shared/models';
import { ENV, FIRESTORE } from '@bk2/shared/config';

import { saveComment } from '@bk2/comment/util';
import { createModel, findAllByField, findByField, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

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
    const _key = await createModel(this.firestore, UserCollection, user, this.tenantId, '@user.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, UserCollection, _key, '@comment.operation.initial.conf');
    return _key;
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
    public async update(user: UserModel, confirmMessage = '@user.operation.update'): Promise<void> {
      user.index = this.getSearchIndex(user);
      await updateModel(this.firestore, UserCollection, user, confirmMessage, this.toastController);
    }

    /**
     * Delete the user. We are not actually deleting the user. We are just archiving it.
     * @param user: the user to delete
     */
    public async delete(user: UserModel): Promise<void> {
      user.isArchived = true;
      await this.update(user, '@user.operation.delete');
    }

    /**
     * Return all documents in the collection as an Observable.
     */
    public list(orderBy = 'loginEmail', sortOrder = 'asc'): Observable<UserModel[]> {
      return searchData<UserModel>(this.firestore, UserCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
    }

  /**
   * Creates a new user account associated with the specified email address and password.
   * Check whether a Firebase account already exists for this email address. If not, create the account.
   * On successful creation of the user account, this new user is signed in. That's why we update the user to the former current user.
   * User account creation can fail if the account already exists and the password is invalid.
   * see https://stackoverflow.com/questions/37517208/firebase-kicks-out-current-user/38013551#38013551
   * for solutions to solve this admin function on the client side without being looged out. 
   * @param user 
   */
/*   
    -> circular dependency !    (because it requires appStore to retrieve the current user)
    move this to AOC if really needed

  public async createUserAndAccount(user: UserModel, password?: string): Promise<void> {
    const _currentFbUser = this.appStore.firebaseUser() ?? die('UserService.createUserAndAccount: no current Firebase user');
    if (!user.loginEmail || user.loginEmail.length === 0) die('UserService.createUserAndAccount: loginEmail is missing - can not register this user');
    try {
      const _uid = await this.createFirebaseAccount(_currentFbUser, user.loginEmail, password);
      if (_uid) {      // the Firebase account exists, now create the user
          user.bkey = _uid;
          user.index = this.getSearchIndex(user);
          await this.create(user);
      } 
    }
    catch (_ex) {
      error(this.toastController, 'UserService.createUserAndAccount -> error: ' + JSON.stringify(_ex));
    }
  } */

  /**
   * Try to create a new Firebase account with the given email address.
   * On successful creation of the user account, this new user is signed in. That's why we update the user to the former current user.
   * @param the current firebase user
   * @param loginEmail the login email address of the new user
   * @returns the uid of the new Firebase account or undefined if there was an error.
   */
/*   public async createFirebaseAccount(fbUser: User, loginEmail: string, password?: string): Promise<string | undefined> {
    const _password = password ? password : generateRandomString(12);
    try {
      const _userCredential = await createUserWithEmailAndPassword(this.auth, loginEmail, _password);
      await showToast(this.toastController, '@auth.operation.create.confirmation');
      await this.updateUser(fbUser); // reset the logged-in user
      return _userCredential.user.uid;
    } catch (_ex) {
      const _error = _ex as AuthError;
      switch (_error.code) {
        case 'auth/email-already-in-use':
          warn(`Email address ${loginEmail} already in use.`);
          break;
        case 'auth/invalid-email':
          warn(`Email address ${loginEmail} is invalid.`);
          break;
        case 'auth/operation-not-allowed':
          warn(`Error during sign up (not allowed).`);
          break;
        case 'auth/weak-password':
          warn('Password is not strong enough. Add additional characters including special characters and numbers.');
          break;
        default:
          warn(_error.message);
          break;
      }
      await this.updateUser(fbUser); // reset the logged-in user
      return undefined;
    }
  } */
  
  /**
   * Set the provided user as the new current user.
   * @param user 
   */
 /*  public async updateUser(user: User | null | undefined): Promise<void> {
    if (user) {
      await this.auth.updateCurrentUser(user);
    }
  } */
  

  /*-------------------------- SEARCH --------------------------------*/
  public getSearchIndex(user: UserModel): string {
    return `n:${user.firstName} ${user.lastName} le:${user.loginEmail} pk:${user.personKey}`;
  }

  public getSearchIndexInfo(): string {
    return 'n:ame le:oginEmail pk:personKey';
    }
}
