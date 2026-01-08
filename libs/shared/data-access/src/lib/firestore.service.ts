
/**
 * This service centralizes all access to Firestore database, making it easier to maintain and update.
 * The service manages subscriptions and cleanup and reduces the risk of stray Webchannel connections causing CORS errors in Safari.
 * It enforces isPlatformBrowser checks to ensure that Firestore operations are only performed in the browser environment (SSR-compatibility).
 * It also is injectable across components and other services, aligning with Angular's dependency injection system.
 * 
 * This service-based approach works with multiple stores calling searchData for different collections, because of:
 * - stateless searchData method
 * - Firestore client SDK (firebase/firestore) and collectionData Observable which handle concurrent real-time updates. Each collectionData call
 *   establishes its own Webchannel listener (or long polling in Safari), managed by the SDK.
 * - Subscription Management: each store or component subscribing to searchData's Observable manages its own subscription lifecycle.
 *   As long as subscriptions are properly managed (e.g., unsubscribed on component destruction), there should be no issues with multiple stores.
 * - Injection Context: the singleton service resolves the NG0203 error (CORS) by injecting PLATFORM_ID in the consturctor
 *   ensuring all calls to searchData are made in the browser context.
 * - Safari CORS fix: Firestore initialization in firestore.ts checks for Safari browser and uses long polling instead of WebSockets.
 * 
 * Concerns:
 * - Share Observables: Use RxJS’s shareReplay to cache and share query results for identical searchData calls, reducing redundant Firestore listeners.
 * - Centralized Subscription Cleanup: Provide a method in FirestoreService to manage subscriptions, simplifying cleanup in stores/components.
 * - Error Handling: Add robust error handling to searchData to catch and log Firestore errors, aiding debugging (e.g., CORS or permission issues).
 * 
 */
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { collection, deleteDoc, doc, query, setDoc, updateDoc, WriteBatch, writeBatch } from 'firebase/firestore';
import { collectionData, docData } from 'rxfire/firestore';
import { Observable, of, shareReplay } from 'rxjs';

import { ENV, FIRESTORE, isFirestoreInitializedCheck } from '@bk2/shared-config';
import { BkModel, CommentCollection, CommentModel, DbQuery, UserModel } from "@bk2/shared-models";
import { error, showToast } from '@bk2/shared-util-angular';
import { debugMessage, generateRandomString, getFullName, getQuery, removeKeyFromBkModel, removeUndefinedFields } from '@bk2/shared-util-core';

import { createComment } from '@bk2/comment-util';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private readonly env = inject(ENV);
  public readonly firestore = inject(FIRESTORE);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toastController = inject(ToastController);
    // Cache for query Observables to avoid duplicate listeners
  private readonly queryCache = new Map<string, Observable<unknown>>();

  /**
   * Save a model as a new Firestore document into the database. 
   * If bkey is not set, the document ID is automatically assigned, otherwise bkey is used as the document ID in Firestore.
   * This function uses setdoc() to overwrite a document with the same ID. If the document does not exist, it will be created.
   * If the document does exist, its contents will be overwritten with the newly provided data.
   * @param collectionName the name of the Firestore collection to create the model in
   * @param model the data to save. if its key is valid, it will be used as the document ID in Firestore. Otherwise, a new document ID will be generated.
   * @return a Promise of the key of the newly stored model
   */
  public async createModel<T extends BkModel>(
    collectionName: string, 
    model: T, 
    confirmMessage?: string,
    currentUser?: UserModel
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return error(undefined, 'FirestoreService.createModel: This method can only be called in the browser context.', true);
    }

    if (!model) {
      return error(undefined, 'FirestoreService.createModel: model is mandatory.', true);
    }
      
    let key = model.bkey;
    // if bkey is not set, we auto-generate a random key for the document ID in firestore.
    if (key?.length === 0) key = generateRandomString(20);
    const path = `${collectionName}/${key}`;
    const ref = doc(this.firestore, path);

    // we delete the bkey from the model because we don't want to store it in the database (ref.id is available instead)
    const persistedModel = removeKeyFromBkModel(model);
    persistedModel.tenants = [this.env.tenantId];   // ensure that the tenant is set

    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(ref, structuredClone(persistedModel));
      if (confirmMessage) {
        await showToast(this.toastController, confirmMessage + '.conf');
      }
      if (currentUser) {
        debugMessage(`FirestoreService.createModel(${collectionName}/${ref.id}) -> OK`, currentUser);
        const comment = createComment(currentUser.bkey, getFullName(currentUser.firstName, currentUser.lastName), '@comment.operation.initial.conf', collectionName + '.' +ref.id, this.env.tenantId);
        await this.saveComment(collectionName, ref.id, comment);
      }
      return Promise.resolve(ref.id);
    }
    catch (ex) {
      console.error(`FirestoreService.createModel(${collectionName}/${ref.id}) -> ERROR:`, ex);
      const message = confirmMessage ? confirmMessage + '.error' : `Could not create model ${collectionName}/${ref.id} in the database.`;      
      return error(this.toastController, message);
    }
  }

  /**
   * Stores a document in Firestore.
   * Use this method to save any data other than a BkModel. For saving a BkModel, use createModel()
   * @param collectionName The name of the collection.
   * @param key The document ID (optional). If this is not set, a new random document ID will be generated.
   * @param data The data to write.
   * @param confirmMessage Optional confirmation message to show in a toast after successful write.
   * @return The document ID or undefined if the operation failed.
   */
  public async createObject<T>(
    collectionName: string, 
    key: string | undefined, 
    data: T, 
    confirmMessage?: string
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return error(undefined, 'FirestoreService.createObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return error(undefined, 'FirestoreService.createObject: collectionName is mandatory.', true);
    }
    // if key is not set, we auto-generate a random key for the document ID in firestore.
    if (key?.length === 0) key = generateRandomString(20);
    const path = `${collectionName}/${key}`;
    const ref = doc(this.firestore, path);

    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(ref, JSON.parse(JSON.stringify(data)));
      if (confirmMessage) {
        await showToast(this.toastController, confirmMessage + '.conf');
      }
      return Promise.resolve(ref.id);
    }
    catch (ex) {
      console.error(`FirestoreService.createObject(${collectionName}/${ref.id}) -> ERROR:`, ex);
      const message = confirmMessage ? confirmMessage + '.error' : `Could not create object ${collectionName}/${ref.id} in the database.`;      
      return error(this.toastController, message);
    }
  }

  /**
   * Lookup a model in the Firestore database and return it as an Observable.
   * @param collectionName the name of the Firestore collection (this can be a path)
   * @param key the key of the document in the database
   * @return an Observable of the model, or undefined if the model could not be found or an error occurred
   */
  public readModel<T extends BkModel>(collectionName: string, key: string | undefined): Observable<T | undefined> {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return of(error(undefined, 'FirestoreService.readModel: This method can only be called in the browser context.', true));
    }
    if (collectionName?.length === 0) {
      return of(error(undefined, 'FirestoreService.readModel: collectionName is mandatory.', true));
    }
    if (!key) {
      return of(error(undefined, 'FirestoreService.readModel: key is mandatory.', true));
    }
    try {
      // we need to add the firestore document id as bkey into the model
      return docData(doc(this.firestore, `${collectionName}/${key}`), { idField: 'bkey' }) as Observable<T>;
    }
    catch (ex) {
      console.error(`FirestoreService.readModel(${collectionName}/${key}) -> ERROR: `, ex);
      return of(error(this.toastController, `Could not read model ${collectionName}/${key} from the database.`));
    }
  }

  /**
   * Lookup an object in the Firestore database and return it as an Observable.
   * @param collectionName the name of the Firestore collection (this can be a path)
   * @param key the key of the document in the database
   * @return an Observable of the object, or undefined if the object could not be found or an error occurred
   */
  public readObject<T>(collectionName: string, key: string | undefined): Observable<T | undefined> {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return of(error(undefined, 'FirestoreService.readObject: This method can only be called in the browser context.', true));
    }
    if (collectionName?.length === 0) {
      return of(error(undefined, 'FirestoreService.readObject: collectionName is mandatory.', true));
    }
    if (!key) {
      return of(error(undefined, 'FirestoreService.readObject: key is mandatory.', true));
    }
    try {
      return docData(doc(this.firestore, `${collectionName}/${key}`)) as Observable<T>;
    }
    catch (ex) {
      console.error(`FirestoreService.readObject(${collectionName}/${key}) -> ERROR: `, ex);
      return of(error(this.toastController, `Could not read object ${collectionName}/${key} from the database.`));
    }
  }

  /**
   * Update the BkModel with id=uid with the given document.
   * Update is for non-destructive updates, ie. it updates the current value
   * within the database with the new value specified as the parameter.
   * @param collectionName the name of the Firestore collection to update the model in
   * @param model the changed BkModel document to save
   * @param forceOverwrite whether to force overwrite the document if it exists; this can be used for createOrUpdate
   * @return a Promise of the key of the updated model or undefined if the operation failed
   */
  public async updateModel<T extends BkModel>(
    collectionName: string, 
    model: T, 
    forceOverwrite = false,
    confirmMessage?: string,
    currentUser?: UserModel
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return error(undefined, 'FirestoreService.updateModel: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return error(undefined, 'FirestoreService.updateModel: collectionName is mandatory.', true);
    }
    if (!model) {
      return error(undefined, 'FirestoreService.updateModel: model is mandatory.', true);
    }
    if (!model.tenants || model.tenants.length === 0) {
      return error(undefined, 'FirestoreService.updateModel: model.tenants is mandatory.', true);
    }
    const key = model.bkey;
    if (!key || key.length === 0) {
      return error(undefined, 'FirestoreService.updateModel: model.bkey is mandatory.', true);
    }

    // we delete attribute bkey from the model because we don't want to store it in the database (_ref.id is available instead)
    const storedModel = removeKeyFromBkModel(structuredClone(model));
    const updateModel = removeUndefinedFields(storedModel);
    try {
      if (forceOverwrite) {
        console.log(`FirestoreService.updateModel: overwriting ${collectionName}/${key}.`, updateModel);
        await setDoc(doc(this.firestore, `${collectionName}/${key}`), structuredClone(updateModel));
      } else {
        console.log(`FirestoreService.updateModel: updating ${collectionName}/${key}.`, updateModel);
        await updateDoc(doc(this.firestore, `${collectionName}/${key}`), structuredClone(updateModel));
      }
      if (confirmMessage) {
        await showToast(this.toastController, confirmMessage + '.conf');
      }
      if (currentUser) {
        debugMessage(`FirestoreService.updateModel(${collectionName}/${key}) -> OK`, currentUser);
        const comment = createComment(currentUser.bkey, getFullName(currentUser.firstName, currentUser.lastName), '@comment.operation.update.conf', collectionName + '.' + key, this.env.tenantId);
        await this.saveComment(collectionName, key, comment);
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.updateModel(${collectionName}/${key}) -> ERROR: `, ex);
      const message = confirmMessage ? confirmMessage + '.error' : `Could not update model ${collectionName}/${key} in the database.`;      
      return error(this.toastController, message);
    }
  }

  /**
   * Save a comment to a Firestore document.
   * @param parentCollection the name of the parent collection
   * @param parentKey the document id of the parent document
   * @param comment the comment to save
   */
  public async saveComment(parentCollection: string, parentKey: string, comment: CommentModel): Promise<void> {
    const commentRef = doc(collection(this.firestore, `${parentCollection}/${parentKey}/${CommentCollection}`));
    await setDoc(commentRef, structuredClone(comment));
  }

  /**
   * Update an object in the Firestore database.
   * @param collectionName the name of the Firestore collection to update the object in
   * @param key the document id of the object in the database
   * @param object the object with the new values
   * @param confirmMessage an optional confirmation message to display in a toast after successful update
   * @returns a Promise of the key of the updated object of undefined if the operation failed
   */
   public async updateObject<T>(
    collectionName: string, 
    key: string, 
    object: T,
    confirmMessage?: string
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return error(undefined, 'FirestoreService.updateObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return error(undefined, 'FirestoreService.updateObject: collectionName is mandatory.', true);
    }
    if (key?.length === 0) {
      return error(undefined, 'FirestoreService.updateObject: object.key is mandatory.', true);
    }
    if (!object) {
      return error(undefined, 'FirestoreService.updateObject: object is mandatory.', true);
    }
    try {
      // spread operator ensures that the object is a pure JavaScript object (e.g. arrays)
      await updateDoc(doc(this.firestore, `${collectionName}/${key}`), { ...object });
      if (confirmMessage) {
        await showToast(this.toastController, confirmMessage + '.conf');
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.updateObject(${collectionName}/${key}) -> ERROR: `, ex);
      return error(this.toastController, `Could not update object ${collectionName}/${key}.`);
    }
  }

  /**
   * Delete a model.
   * We don't delete models permanently. Instead we archive the models.
   * Admin can permanently delete archived models directly in the database.
   * @param collectionName the name of the Firestore collection to delete the model from
   * @param model the model document to delete
   * @return a promise of the key of the deleted model or undefined if the operation failed
   */
  public async deleteModel<T extends BkModel>(
    collectionName: string, 
    model: T,
    confirmMessage?: string,
    currentUser?: UserModel
  ): Promise<string | undefined> 
  {
    model.isArchived = true;
    return await this.updateModel(collectionName, model, false, confirmMessage, currentUser);
  }

  /**
   * Delete an object in the database.
   * Objects are directly and permanently deleted in the database.
  * @param collectionName the name of the Firestore collection to delete the model from
  * @param key the document id of the object in the database
  * @returns a Promise that resolves to the key of the deleted object or undefined if the operation failed
  */
  public async deleteObject(collectionName: string, key: string, confirmMessage?: string): Promise<string | undefined> {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      return error(undefined, 'FirestoreService.deleteObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return error(undefined, 'FirestoreService.deleteObject: collectionName is mandatory.', true);
    }
    if (key?.length === 0) {
      return error(undefined, 'FirestoreService.deleteObject: object.key is mandatory.', true);
    }
    try {
      await deleteDoc(doc(this.firestore, `${collectionName}/${key}`));
      if (confirmMessage) {
        await showToast(this.toastController, confirmMessage + '.conf');
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.deleteObject(${collectionName}/${key}) -> ERROR: `, ex);
      return error(this.toastController, `Could not delete object ${collectionName}/${key}.`);
    }
  }

  /**
   * Execute a Firestore query to search for data in a collection.
   * This method is stateless and can be called multiple times without side effects.
   * It returns an Observable that emits the results of the query.
   * It detects Safari browsers to handle known Safari-specific quirk with Firestore's WebSocket-base real-time listeners 
   * (e.g. onSnapshot or collectionData). Safari falls back to HTTP long polling via /channel endpoints, which can trigger 
   * stricter CORS checks or indexedDB access issues during page navigation/reloads, unlike Chrome's WebSocket preference.
   * @param collectionName The name of the collection.
   * @param dbQuery The query parameters.
   * @param orderByParam The field to order by.
   * @param sortOrderParam The sort order (asc/desc).
   * @returns An Observable that emits the query results.
   */
  public searchData<T>(
    collectionName: string,
    dbQuery: DbQuery[],
    orderByParam = 'name',
    sortOrderParam = 'asc'
  ): Observable<T[]> {
    if (!isPlatformBrowser(this.platformId)) {
      return of([]);
    }

    if (!isFirestoreInitializedCheck()) {
      return of([]);
    }

    const cacheKey = JSON.stringify({ collectionName, dbQuery, orderByParam, sortOrderParam });

    // Return cached observable if exists (shared across all subscribers)
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)! as Observable<T[]>;
    }

    try {
      const queries = getQuery(dbQuery, orderByParam, sortOrderParam);
      const collectionRef = collection(this.firestore, collectionName);
      const q = query(collectionRef, ...queries);

      const data$ = collectionData(q, { idField: 'bkey' }).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      ) as Observable<T[]>;

      this.queryCache.set(cacheKey, data$);
      return data$;
    } catch (err) {
      console.error('FirestoreService.searchData error:', err);
      return of([]);
    }
  }
/*   public searchData<T>(
    collectionName: string,
    dbQuery: DbQuery[],
    orderByParam = 'name',
    sortOrderParam = 'asc'
  ): Observable<T[]> {
    // ensure that the method is only called in the browser context; returns [] in SSR context
    if (!isPlatformBrowser(this.platformId)) {
      console.warn('FirestoreService.searchData: Called in non-browser context, returning empty array.');
      return of([]);
    }

    // Guard against queries before Firestore initialization
    if (!isFirestoreInitializedCheck()) {
      console.warn('FirestoreService.searchData: Firestore not initialized yet, returning empty array.');
      return of([]);
    }

    const isSafariBrowser = isSafari();
    
    // Create a cache key based on query parameters to avoid duplicate listeners
    const cacheKey = JSON.stringify({ collectionName, dbQuery, orderByParam, sortOrderParam });

    // Clear cache on page reload for Safari to avoid stale WebChannel connections
    if (isSafariBrowser && performance?.navigation?.type === 1) {
      console.log('FirestoreService.searchData: Clearing cache for Safari on reload.');
      this.queryCache.delete(cacheKey);
      this.safariCache.delete(cacheKey);
    }

    if (isSafariBrowser) {
      console.log(`FirestoreService.searchData: Using polling with manual session cache for Safari on ${collectionName}`);
      // Initialize session cache if not exists
      if (!this.safariCache.has(cacheKey)) {
        console.log('FirestoreService.searchData: initializing session cache');
        this.safariCache.set(cacheKey, new BehaviorSubject<T[]>(this.loadFromSessionStorage(cacheKey)));
      }
      const cacheSubject = this.safariCache.get(cacheKey)!;

      // poll every hour (60 * 60 * 1000 ms) to refresh data
      return interval(3600000).pipe(
        startWith(0), // Trigger immediately
        switchMap(() => from(this.getSnapshot<T>(collectionName, dbQuery, orderByParam, sortOrderParam))),
        map(data => {
          // Update session storage and BehaviorSubject
          this.saveToSessionStorage(cacheKey, data);
          cacheSubject.next(data);
          return data;
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }

    // Return cached Observable if it exists
    if (this.queryCache.has(cacheKey)) {
      console.log(`FirestoreService.searchData: Returning cached data for ${cacheKey}`);
      return this.queryCache.get(cacheKey) as Observable<T[]>;
    }

    try {
      const queries = getQuery(dbQuery, orderByParam, sortOrderParam); // Assume getQuery is defined
      const collectionRef = collection(this.firestore, collectionName);
      const queryRef = query(collectionRef, ...queries);
      
      // Create Observable with shareReplay to cache results and share among subscribers
      const data$ = collectionData(queryRef, { idField: 'bkey' }).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      ) as Observable<T[]>;

      // Cache the Observable
      console.log(`FirestoreService.searchData: Setting cache for ${cacheKey}`);
      this.queryCache.set(cacheKey, data$);
      return data$;
    } catch (error) {
      console.error(`Firestore query error for ${collectionName}:`, error);
      return of([]); // Return empty array on error
    }
  } */

  /**
   * One-time query using getDocs/query. This is only used by Safari browsers, because of its WebSocket limitations.
   * @param collectionName 
   * @param dbQuery 
   * @param orderByParam 
   * @param sortOrderParam 
   * @returns 
   */
/*   private async getSnapshot<T>(collectionName: string, dbQuery: DbQuery[], orderByParam: string, sortOrderParam: string): Promise<T[]> {
    try {
      const queries = getQuery(dbQuery, orderByParam, sortOrderParam);
      const collectionRef = collection(this.firestore, collectionName);
      const queryRef = query(collectionRef, ...queries);
      const snapshot = await getDocs(queryRef);
      return snapshot.docs.map(doc => ({ ...doc.data(), bkey: doc.id } as T));
    } catch (error) {
      console.error(`FirestoreService.getSnapshot: Error for ${collectionName}:`, error);
      return [];
    }
  }

  private loadFromSessionStorage<T>(cacheKey: string): T[] {
    console.log(`FirestoreService.loadFromSessionStorage(${cacheKey})`);
    if (typeof sessionStorage === 'undefined') return [];
    const cached = sessionStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  }

  private saveToSessionStorage<T>(cacheKey: string, data: T[]): void {
    if (typeof sessionStorage !== 'undefined') {
      console.log(`FirestoreService.saveToSessionStorage(${cacheKey})`);
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    }
  } */

  public listAllObjects<T>(collectionName: string): Observable<T[]> {
    const collectionRef = collection(this.firestore, collectionName);
    const queryRef = query(collectionRef);
    return collectionData(queryRef) as Observable<T[]>;
  }

  // Optional: Clear cache for a specific query
  public clearCache(collectionName: string, dbQuery: DbQuery[], orderByParam = 'name', sortOrderParam = 'asc') {
    const cacheKey = JSON.stringify({ collectionName, dbQuery, orderByParam, sortOrderParam });
    this.queryCache.delete(cacheKey);
  }

  /**
   * Execute multiple write operations as a single batch (set, update, delete).
   * Use like this:
   * a) const batch = firestoreService.getBatch();
   * b) batch.set(...); batch.update(...); batch.delete(...);
   * c) await batch.commit();
   * @returns 
   */
  public getBatch(): WriteBatch {
    return writeBatch(this.firestore);
  }
}