
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
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { captureMessage } from '@sentry/angular';
import { arrayRemove, collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, WriteBatch, writeBatch } from 'firebase/firestore';
import { collectionData, docData } from 'rxfire/firestore';
import { catchError, defer, firstValueFrom, from, MonoTypeOperatorFunction, Observable, of, ReplaySubject, retry, share, tap, timer } from 'rxjs';

import { AUTH, ensureAppCheckToken, ENV, FIRESTORE, isFirestoreInitializedCheck } from '@okr/shared-config';
import { OkrModel, CommentCollection, CommentModel, DbQuery, UserCollection, UserModel } from "@okr/shared-models";
import { debugData, debugMessage, generateRandomString, getDeletePatch, getFullName, getQuery, getSystemQuery, isBrowser, removeKeyFromOkrModel, removeUndefinedFields } from '@okr/shared-util-core';
import { TOAST_LENGTH } from '@okr/shared-constants';
import { I18nService } from "@okr/shared-i18n";

import { createComment } from '@okr/comment-util';

import { PFX } from "./scope";
import { firestoreSubscriptionMonitor } from './firestore-subscription-monitor';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private readonly env = inject(ENV);
  public readonly firestore = inject(FIRESTORE);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toastController = inject(ToastController);
  private readonly queryCache = new Map<string, Observable<unknown>>();
  private readonly docCache = new Map<string, Observable<unknown>>();
  private readonly i18nService = inject(I18nService);
  private readonly auth = inject(AUTH);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    comment_initial_conf: PFX + 'comment.initial.conf',
    comment_update_conf: PFX + 'comment.update.conf',
  })
  
  /**
   * Report an async error from an open real-time listener.
   *
   * Rule-gated listeners stay open across sign-out: signOut() revokes the token and the server
   * then terminates every one of them at once with PERMISSION_DENIED. That is expected teardown,
   * not a fault — reporting it at error level buried genuine failures under a burst of logout
   * noise. Demote exactly that case (permission-denied AND nobody signed in) to debug; everything
   * else — including a permission error while a user IS signed in, which is a real rules/query
   * defect — keeps its console.error.
   * @param context the call site, e.g. `searchData(persons)`
   * @param err the error emitted by the stream
   */
  /**
   * How often a denied listener is re-attempted after refreshing the App Check token.
   * Two is enough to survive a resume; beyond that the denial is not about the token.
   */
  private static readonly DENIAL_RETRIES = 2;

  /**
   * Re-attach an open listener that the server killed with PERMISSION_DENIED **while a user is
   * still signed in** — the App-Check-expiry-on-resume case.
   *
   * App Check is ENFORCED on Firestore here and its token is refreshed by a timer, which is
   * exactly what a backgrounded tab does not get (Safari/WebKit suspend timers in hidden tabs,
   * see `ensureAppCheckToken`). A tab that has been away for a while therefore wakes holding an
   * expired token, and the backend terminates EVERY open listener at once. `ensureAppCheckToken`
   * already protects resume-time WRITES; reads had no equivalent, so the whole app came back with
   * dead listeners: `catchError` below turns each one into a completed empty stream, and since
   * nothing re-subscribes, every list stays empty and every console fills with one
   * permission-denied line per collection until the user reloads the page.
   *
   * So: refresh the token, then resubscribe. `resetOnSuccess` makes the budget per incident
   * rather than per listener lifetime, so a long-lived stream survives many resumes.
   *
   * Deliberately NOT retried:
   * - denied while signed OUT — that is sign-out teardown ({@link reportStreamError}); retrying
   *   would re-open listeners the user just abandoned.
   * - anything that is not `permission-denied` — transport errors are the SDK's to retry.
   *
   * A genuine rules/query defect is also `permission-denied` while signed in and therefore costs
   * {@link DENIAL_RETRIES} extra round trips before it surfaces. That is the accepted price: the
   * two cases are indistinguishable from the client, and a defect surfaces on the very next
   * subscription anyway.
   *
   * @param context the call site, e.g. `searchData(persons)`
   */
  private recoverFromTokenDenial<T>(context: string): MonoTypeOperatorFunction<T> {
    return retry<T>({
      count: FirestoreService.DENIAL_RETRIES,
      resetOnSuccess: true,
      delay: (err, retryCount) => {
        if ((err as { code?: string } | null)?.code !== 'permission-denied' || !this.auth.currentUser) {
          throw err;   // not ours — hand it to catchError unchanged
        }
        console.debug(`FirestoreService.${context}: listener denied, refreshing the App Check token (attempt ${retryCount}).`);
        return from(ensureAppCheckToken());
      },
    });
  }

  private reportStreamError(context: string, err: unknown): void {
    if ((err as { code?: string } | null)?.code === 'permission-denied' && !this.auth.currentUser) {
      console.debug(`FirestoreService.${context}: listener closed by sign-out.`);
      return;
    }
    console.error(`FirestoreService.${context} stream error:`, err);
  }

  /**
   * Report a write that failed WITHOUT a user-facing toast.
   *
   * A suppressed write is invisible by definition: the user is never told and the console line
   * dies with the tab. Sentry is therefore the ONLY place such a failure can still be observed,
   * and the Firestore error code is the whole diagnosis — `permission-denied` on a rule-satisfying
   * write means App Check (ENFORCED on Firestore here) rejected the request, typically because a
   * backgrounded tab woke with an expired token; `unavailable` means transport.
   *
   * Writes that DO toast are deliberately not reported: the user sees them and can report them,
   * and mirroring every one into Sentry would drown the silent ones this exists for.
   * @param context the call site, e.g. `createModel(sessions/abc)`
   * @param ex the rejection from the Firestore SDK
   */
  private reportSilentWriteFailure(context: string, ex: unknown): void {
    const code = (ex as { code?: string } | null)?.code ?? 'unknown';
    captureMessage(`FirestoreService.${context} failed silently: ${code}`, {
      level: 'warning',
      tags: { firestoreCode: code },
      extra: { context, detail: (ex as Error | null)?.message },
    });
  }

  private okrError(toastController: ToastController | undefined, message: string, isDebugMode = false): undefined {
    if (isDebugMode) console.error(message);
    if (toastController) this.okrShowToast(toastController, message);
    return undefined;
  }

  private async okrShowToast(toastController: ToastController, message: string): Promise<void> {
    const _toast = await toastController.create({ message, duration: TOAST_LENGTH });
    _toast.present();
  }

  /**
   * Save a model as a new Firestore document into the database. 
   * If okey is not set, the document ID is automatically assigned, otherwise okey is used as the document ID in Firestore.
   * This function uses setdoc() to overwrite a document with the same ID. If the document does not exist, it will be created.
   * If the document does exist, its contents will be overwritten with the newly provided data.
   * @param collectionName the name of the Firestore collection to create the model in
   * @param model the data to save. if its key is valid, it will be used as the document ID in Firestore. Otherwise, a new document ID will be generated.
   * @param suppressErrorToast when true, a failed write does NOT pop a user-facing toast (it is
   *        still logged to the console). Use for best-effort background writes (e.g. audit logs)
   *        whose failure must never surface to the user.
   * @return a Promise of the key of the newly stored model
   */
  public async createModel<T extends OkrModel>(
    collectionName: string,
    model: T,
    confirmMessage?: string,
    errorMessage?: string,
    currentUser?: UserModel,
    suppressErrorToast = false
  ): Promise<string | undefined>
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.createModel: This method can only be called in the browser context.', true);
    }

    if (!model) {
      return this.okrError(undefined, 'FirestoreService.createModel: model is mandatory.', true);
    }
      
    let key = model.okey;
    // if okey is not set, we auto-generate a random key for the document ID in firestore.
    if (key?.length === 0) key = generateRandomString(20);
    const path = `${collectionName}/${key}`;
    const ref = doc(this.firestore, path);

    // we delete the okey from the model because we don't want to store it in the database (ref.id is available instead)
    const persistedModel = removeKeyFromOkrModel(model);
    persistedModel.tenants = [this.env.tenantId];   // ensure that the tenant is set

    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(ref, structuredClone(persistedModel));
      if (confirmMessage) {
        await this.okrShowToast(this.toastController, confirmMessage);
      }
      if (currentUser) {
        debugMessage(`FirestoreService.createModel(${collectionName}/${ref.id}) -> OK`, currentUser);
        const comment = createComment(currentUser.okey, getFullName(currentUser.firstName, currentUser.lastName), this.i18n.comment_initial_conf(), collectionName + '.' +ref.id, this.env.tenantId);
        await this.saveComment(comment);
      }
      return Promise.resolve(ref.id);
    }
    catch (ex) {
      console.error(`FirestoreService.createModel(${collectionName}/${ref.id}) -> ERROR:`, ex);
      if (suppressErrorToast) this.reportSilentWriteFailure(`createModel(${collectionName}/${ref.id})`, ex);
      const message = errorMessage ? errorMessage : `Could not create model ${collectionName}/${ref.id} in the database.`;
      return this.okrError(suppressErrorToast ? undefined : this.toastController, message);
    }
  }

  /**
   * Creates many models in a single batched write — for seeding (chart of accounts, VAT codes, ...)
   * where createModel() in a loop would fire one toast and one comment per document.
   * Firestore caps a batch at 500 writes; larger lists are committed in chunks.
   * @param collectionName The name of the collection.
   * @param models The models to write. A model with an okey keeps it (re-seeding overwrites).
   * @param errorMessage Optional error message to show in a toast if the write fails.
   * @return true if all writes were committed.
   */
  public async createModels<T extends OkrModel>(collectionName: string, models: T[], errorMessage?: string): Promise<boolean> {
    if (!isBrowser(this.platformId)) {
      this.okrError(undefined, 'FirestoreService.createModels: This method can only be called in the browser context.', true);
      return false;
    }

    try {
      for (let i = 0; i < models.length; i += 500) {
        const batch = this.getBatch();
        for (const model of models.slice(i, i + 500)) {
          const key = model.okey?.length > 0 ? model.okey : generateRandomString(20);
          const persistedModel = removeKeyFromOkrModel(model);
          persistedModel.tenants = [this.env.tenantId];
          batch.set(doc(this.firestore, `${collectionName}/${key}`), structuredClone(persistedModel));
        }
        await batch.commit();
      }
      return true;
    }
    catch (ex) {
      console.error(`FirestoreService.createModels(${collectionName}, ${models.length}) -> ERROR:`, ex);
      this.okrError(this.toastController, errorMessage ?? `Could not create ${models.length} models in ${collectionName}.`);
      return false;
    }
  }

  /**
   * Stores a document in Firestore.
   * Use this method to save any data other than a OkrModel. For saving a OkrModel, use createModel()
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
    confirmMessage?: string,
    errorMessage?: string,
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.createObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.createObject: collectionName is mandatory.', true);
    }
    // if key is not set, we auto-generate a random key for the document ID in firestore.
    if (key?.length === 0) key = generateRandomString(20);
    const path = `${collectionName}/${key}`;
    const ref = doc(this.firestore, path);

    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(ref, JSON.parse(JSON.stringify(data)));
      if (confirmMessage) {
        await this.okrShowToast(this.toastController, confirmMessage);
      }
      return Promise.resolve(ref.id);
    }
    catch (ex) {
      console.error(`FirestoreService.createObject(${collectionName}/${ref.id}) -> ERROR:`, ex);
      const message = errorMessage ? errorMessage : `Could not create object ${collectionName}/${ref.id} in the database.`;      
      return this.okrError(this.toastController, message);
    }
  }

  /**
   * Shared, cached docData listener for a single document — the readModel/readObject twin of
   * searchData's queryCache.
   *
   * Without it every subscriber to the same document opened its OWN Firestore listener and threw
   * it away on destroy, so a doc read by several components (or re-read on back-navigation)
   * rendered empty until a fresh snapshot arrived. Same 30 s grace window as searchData: the
   * listener and the last snapshot outlive the last unsubscribe, which is what makes a revisit
   * paint instantly on Safari / Firefox / iOS — those run on memoryLocalCache (see
   * @okr/shared-config firestore.ts), so there is no local copy and the refill is a full round
   * trip over forced long polling.
   *
   * catchError guards the open listener against an async PERMISSION_DENIED on sign-out / token
   * refresh (SCS-1E) which the callers' synchronous try/catch cannot see: unguarded it lands in
   * a consuming rxResource whose .value() re-throws inside change detection and crashes the app.
   * Emitting undefined reads as "no current user" to the downstream guards, which short-circuit
   * to empty lists — the correct sign-out behaviour. The poisoned entry is evicted so a later
   * re-subscription builds a fresh listener.
   *
   * @param path the full document path, `collection/key`
   * @param withOkey attach the Firestore document id as `okey` (models yes, plain objects no)
   */
  private sharedDoc<T>(path: string, withOkey: boolean): Observable<T | undefined> {
    const cacheKey = `${withOkey ? 'model' : 'object'}:${path}`;
    const cached = this.docCache.get(cacheKey) as Observable<T | undefined> | undefined;
    if (cached) return cached;

    const ref = doc(this.firestore, path);
    const shared$ = (withOkey
      ? docData(ref, { idField: 'okey' }) as Observable<T>
      : docData(ref) as Observable<T>
    ).pipe(
      // Survive a resume-time App Check expiry before treating the denial as final.
      this.recoverFromTokenDenial<T>(`sharedDoc(${path})`),
      catchError((err) => {
        this.reportStreamError(`sharedDoc(${path})`, err);
        this.docCache.delete(cacheKey);
        firestoreSubscriptionMonitor.closed(cacheKey);
        return of(undefined);
      }),
      // Messpunkt VOR share: echte Snapshots. Siehe FirestoreSubscriptionMonitor.
      tap(() => firestoreSubscriptionMonitor.sourceEmitted(cacheKey)),
      share({
        connector: () => new ReplaySubject<T | undefined>(1),
        resetOnRefCountZero: () => timer(30_000),
      })
    );

    // defer + tap NACH share: zählt Abonnements und ausgelieferte Werte (Replays eingeschlossen).
    const data$ = defer(() => {
      firestoreSubscriptionMonitor.subscribed(cacheKey);
      return shared$;
    }).pipe(tap(() => firestoreSubscriptionMonitor.deliveredValue(cacheKey)));

    this.docCache.set(cacheKey, data$);
    firestoreSubscriptionMonitor.opened('doc', path.split('/')[0], cacheKey);
    return data$;
  }

  /**
   * Lookup a model in the Firestore database and return it as an Observable.
   * @param collectionName the name of the Firestore collection (this can be a path)
   * @param key the key of the document in the database
   * @return an Observable of the model, or undefined if the model could not be found or an error occurred
   */
  public readModel<T extends OkrModel>(collectionName: string, key: string | undefined): Observable<T | undefined> {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isBrowser(this.platformId)) {
      return of(this.okrError(undefined, 'FirestoreService.readModel: This method can only be called in the browser context.', true));
    }
    if (collectionName?.length === 0) {
      return of(this.okrError(undefined, 'FirestoreService.readModel: collectionName is mandatory.', true));
    }
    if (!key) {
      return of(this.okrError(undefined, 'FirestoreService.readModel: key is mandatory.', true));
    }
    try {
      // we need to add the firestore document id as okey into the model
      return this.sharedDoc<T>(`${collectionName}/${key}`, true);
    }
    catch (ex) {
      console.error(`FirestoreService.readModel(${collectionName}/${key}) -> ERROR: `, ex);
      return of(this.okrError(this.toastController, `Could not read model ${collectionName}/${key} from the database.`));
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
    if (!isBrowser(this.platformId)) {
      return of(this.okrError(undefined, 'FirestoreService.readObject: This method can only be called in the browser context.', true));
    }
    if (collectionName?.length === 0) {
      return of(this.okrError(undefined, 'FirestoreService.readObject: collectionName is mandatory.', true));
    }
    if (!key) {
      return of(this.okrError(undefined, 'FirestoreService.readObject: key is mandatory.', true));
    }
    try {
      return this.sharedDoc<T>(`${collectionName}/${key}`, false);
    }
    catch (ex) {
      console.error(`FirestoreService.readObject(${collectionName}/${key}) -> ERROR: `, ex);
      return of(this.okrError(this.toastController, `Could not read object ${collectionName}/${key} from the database.`));
    }
  }

  /**
   * Update the OkrModel with id=uid with the given document.
   * Update is for non-destructive updates, ie. it updates the current value
   * within the database with the new value specified as the parameter.
   * @param collectionName the name of the Firestore collection to update the model in
   * @param model the changed OkrModel document to save
   * @param forceOverwrite whether to force overwrite the document if it exists; this can be used for createOrUpdate
   * @param suppressErrorToast when true, a failed write does NOT pop a user-facing toast; it is
   *        logged and reported to Sentry instead. Use for best-effort background writes (session
   *        heartbeat, telemetry) whose failure must never surface to the user.
   * @return a Promise of the key of the updated model or undefined if the operation failed
   */
  public async updateModel<T extends OkrModel>(
    collectionName: string, 
    model: T, 
    forceOverwrite = false,
    confirmMessage?: string,
    errorMessage?: string,
    currentUser?: UserModel,
    suppressErrorToast = false
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.updateModel: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.updateModel: collectionName is mandatory.', true);
    }
    if (!model) {
      return this.okrError(undefined, 'FirestoreService.updateModel: model is mandatory.', true);
    }
    if (!model.tenants || model.tenants.length === 0) {
      return this.okrError(undefined, 'FirestoreService.updateModel: model.tenants is mandatory.', true);
    }
    const key = model.okey;
    if (!key || key.length === 0) {
      return this.okrError(undefined, 'FirestoreService.updateModel: model.okey is mandatory.', true);
    }

    // we delete attribute okey from the model because we don't want to store it in the database (_ref.id is available instead)
    const storedModel = removeKeyFromOkrModel(structuredClone(model));
    const updateModel = removeUndefinedFields(storedModel);
    try {
      if (forceOverwrite) {
        debugData(`FirestoreService.updateModel: overwriting ${collectionName}/${key} (set).`, updateModel, currentUser);
        await setDoc(doc(this.firestore, `${collectionName}/${key}`), { ...updateModel });
      } else {
        debugData(`FirestoreService.updateModel: updating ${collectionName}/${key} (update).`, updateModel, currentUser);
        await updateDoc(doc(this.firestore, `${collectionName}/${key}`), { ...updateModel });
      }
      if (confirmMessage) {
        await this.okrShowToast(this.toastController, confirmMessage);
      }
      if (currentUser) {
        debugMessage(`FirestoreService.updateModel(${collectionName}/${key}) -> OK`, currentUser);
        const comment = createComment(currentUser.okey, getFullName(currentUser.firstName, currentUser.lastName), this.i18n.comment_update_conf(), collectionName + '.' + key, this.env.tenantId);
        await this.saveComment(comment);
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.updateModel(${collectionName}/${key}) -> ERROR: `, ex);
      if (suppressErrorToast) this.reportSilentWriteFailure(`updateModel(${collectionName}/${key})`, ex);
      const message = errorMessage ? errorMessage : `Could not update model ${collectionName}/${key} in the database.`;      
      return this.okrError(suppressErrorToast ? undefined : this.toastController, message);
    }
  }

  /**
   * Update an object in the Firestore database.
   * Update is for non-destructive updates, ie. it updates the current value
   * within the database with the new value specified as the parameter.
   * @param collectionName the name of the Firestore collection to update the object in
   * @param key the document id of the object in the database
   * @param object the object with the new values
   * @param forceOverwrite whether to force overwrite the document if it exists; this can be used for createOrUpdate
   * @param confirmMessage an optional confirmation message to display in a toast after successful update
   * @returns a Promise of the key of the updated object of undefined if the operation failed
   */
   public async updateObject<T>(
    collectionName: string, 
    key: string, 
    object: T,
    forceOverwrite = false,
    confirmMessage?: string,
    currentUser?: UserModel
  ): Promise<string | undefined> 
  {
    // ensure that the method is only called in the browser context; return undefined in SSR context
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.updateObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.updateObject: collectionName is mandatory.', true);
    }
    if (key?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.updateObject: object.key is mandatory.', true);
    }
    if (!object) {
      return this.okrError(undefined, 'FirestoreService.updateObject: object is mandatory.', true);
    }
    try {
      // spread operator ensures that the object is a pure JavaScript object (e.g. arrays)
      if (forceOverwrite) {
        debugData(`FirestoreService.updateObject: overwriting ${collectionName}/${key} (set).`, object, currentUser);
        await setDoc(doc(this.firestore, `${collectionName}/${key}`), { ...object});
      } else {
        debugData(`FirestoreService.updateObject: updating ${collectionName}/${key} (update).`, object, currentUser);
        await updateDoc(doc(this.firestore, `${collectionName}/${key}`), { ...object });  
      }
      if (confirmMessage) {
        await this.okrShowToast(this.toastController, confirmMessage);
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.updateObject(${collectionName}/${key}) -> ERROR: `, ex);
      return this.okrError(this.toastController, `Could not update object ${collectionName}/${key}.`);
    }
  }

  /**
   * Save a comment to a Firestore document.
   * @param comment the comment model to save
   */
  public async saveComment(comment: CommentModel): Promise<void> {
    const commentRef = doc(collection(this.firestore, CommentCollection));
    await setDoc(commentRef, structuredClone(comment));
  }

  /**
   * Delete a model.
   * We don't delete models permanently. Instead we archive the models.
   * Admin can permanently delete archived models directly in the database.
   *
   * Tenant-aware: a document shared with other tenants (`tenants: ['scs', 'kring']`) is only
   * detached from the current tenant — archiving it would kill it in the other apps too.
   * `isArchived` is set only when the current tenant is the last one. See `getDeletePatch`.
   * @param collectionName the name of the Firestore collection to delete the model from
   * @param model the model document to delete
   * @return a promise of the key of the deleted model or undefined if the operation failed
   */
  public async deleteModel<T extends OkrModel>(
    collectionName: string, 
    model: T,
    confirmMessage?: string,
    errorMessage?: string,
    currentUser?: UserModel
  ): Promise<string | undefined> 
  {
    Object.assign(model, getDeletePatch(model.tenants, this.env.tenantId));
    return await this.updateModel(collectionName, model, false, confirmMessage, errorMessage, currentUser);
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
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.deleteObject: This method can only be called in the browser context.', true);
    }
    if (collectionName?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.deleteObject: collectionName is mandatory.', true);
    }
    if (key?.length === 0) {
      return this.okrError(undefined, 'FirestoreService.deleteObject: object.key is mandatory.', true);
    }
    try {
      await deleteDoc(doc(this.firestore, `${collectionName}/${key}`));
      if (confirmMessage) {
        await this.okrShowToast(this.toastController, confirmMessage);
      }
      return Promise.resolve(key);
    }
    catch (ex) {
      console.error(`FirestoreService.deleteObject(${collectionName}/${key}) -> ERROR: `, ex);
      return this.okrError(this.toastController, `Could not delete object ${collectionName}/${key}.`);
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
   * @param orderByParam The field to order by. May be 'none' to indicate no ordering.
   * @param sortOrderParam The sort order (asc/desc).
   * @returns An Observable that emits the query results.
   */
  public searchData<T>(
    collectionName: string,
    dbQuery: DbQuery[],
    orderByParam = 'name',
    sortOrderParam = 'asc'
  ): Observable<T[]> {
    if (!isBrowser(this.platformId)) {
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
      const queries = orderByParam === 'none' ? getQuery(dbQuery, 'none') : getQuery(dbQuery, orderByParam, sortOrderParam);
      const collectionRef = collection(this.firestore, collectionName);
      const queryRef = query(collectionRef, ...queries);

      // shareReplay to cache and share the latest emitted value among multiple subscribers.
      // catchError guards against ASYNC stream errors (e.g. a transient Firestore Listen
      // PERMISSION_DENIED during token refresh, SCS-13) which the outer try/catch — synchronous
      // only — cannot catch. Without it the error propagates into any consuming rxResource, whose
      // .value() then re-throws inside change detection and crashes the app. We log, evict the
      // poisoned cache entry so a later reload()/re-subscription rebuilds a fresh listener, and
      // fall back to an empty list.
      const shared$ = (collectionData(queryRef, { idField: 'okey' }) as Observable<T[]>).pipe(
        // Survive a resume-time App Check expiry before treating the denial as final.
        this.recoverFromTokenDenial<T[]>(`searchData(${collectionName})`),
        catchError((err) => {
          this.reportStreamError(`searchData(${collectionName})`, err);
          this.queryCache.delete(cacheKey);
          firestoreSubscriptionMonitor.closed(cacheKey);
          return of<T[]>([]);
        }),
        // Keep the listener AND the last snapshot alive for 30 s after the last unsubscribe.
        // shareReplay({refCount: true}) tore both down the instant a list view was destroyed, so
        // navigating away and straight back re-opened the listener and rendered EMPTY until a
        // fresh snapshot arrived — the reported "an item is missing, then it reappears". Safari /
        // Firefox / iOS feel it worst: they run on memoryLocalCache (see @okr/shared-config
        // firestore.ts), so there is no local copy to paint from, and the refill is a full round
        // trip over forced long polling. The grace window makes back-navigation instant while
        // still releasing genuinely idle queries.
        // Messpunkt VOR share: echte Firestore-Snapshots. Siehe FirestoreSubscriptionMonitor.
        tap(() => firestoreSubscriptionMonitor.sourceEmitted(cacheKey)),
        share({
          connector: () => new ReplaySubject<T[]>(1),
          resetOnRefCountZero: () => timer(30_000),
        })
      );

      // defer + tap NACH share: zählt Abonnements und ausgelieferte Werte (Replays eingeschlossen).
      // Die drei Zähler zusammen unterscheiden «Firestore emittiert mehrfach» von «mehrere
      // Konsumenten bekommen denselben Wert erneut ausgespielt».
      const data$ = defer(() => {
        firestoreSubscriptionMonitor.subscribed(cacheKey);
        return shared$;
      }).pipe(tap(() => firestoreSubscriptionMonitor.deliveredValue(cacheKey)));

      this.queryCache.set(cacheKey, data$);
      firestoreSubscriptionMonitor.opened('query', collectionName, cacheKey);
      return data$;
    } catch (err) {
      console.error('FirestoreService.searchData error:', err);
      return of([]);
    }
  }

  /**
   * One-shot, consistent read of a collection — the Promise-returning counterpart to {@link searchData}.
   *
   * Use this for "load once, then process" reads (building an index, an export, a migration step):
   * anywhere you would otherwise write `firstValueFrom(searchData(...))` or `searchData(...).pipe(take(1))`.
   *
   * Why it exists: searchData returns a real-time onSnapshot stream whose FIRST emission can be an
   * empty/partial snapshot served from the local cache (metadata.fromCache) before the server snapshot
   * arrives — always so on Safari/Firefox, which use memoryLocalCache and are cold on every reload.
   * Taking that first emission (firstValueFrom/take(1)/first()) intermittently yields incomplete data.
   * getDocs returns a single consistent snapshot (server when online) and never hands back a cache-first
   * partial. Same query construction as searchData, so filters/ordering are identical.
   */
  public async getDataOnce<T>(
    collectionName: string,
    dbQuery: DbQuery[],
    orderByParam = 'name',
    sortOrderParam = 'asc'
  ): Promise<T[]> {
    if (!isBrowser(this.platformId)) return [];
    if (!isFirestoreInitializedCheck()) return [];

    try {
      const queries = orderByParam === 'none' ? getQuery(dbQuery, 'none') : getQuery(dbQuery, orderByParam, sortOrderParam);
      const collectionRef = collection(this.firestore, collectionName);
      const queryRef = query(collectionRef, ...queries);
      const snapshot = await getDocs(queryRef);
      return snapshot.docs.map(d => ({ ...d.data(), okey: d.id })) as T[];
    } catch (err) {
      console.error('FirestoreService.getDataOnce error:', err);
      return [];
    }
  }

  public listAllObjects<T>(collectionName: string, addOkey = false): Observable<T[]> {
    const collectionRef = collection(this.firestore, collectionName);
    const queryRef = query(collectionRef);
    const data$ = addOkey ? collectionData(queryRef, { idField: 'okey' }) as Observable<T[]> : collectionData(queryRef) as Observable<T[]>;
    // see readModel: guards the open listener against an async PERMISSION_DENIED on sign-out /
    // token refresh, which would otherwise re-throw inside change detection via a consuming resource.
    return data$.pipe(
      catchError((err) => {
        this.reportStreamError(`listAllObjects(${collectionName})`, err);
        return of<T[]>([]);
      })
    );
  }

  // Optional: Clear cache for a specific query
  public clearCache(collectionName: string, dbQuery: DbQuery[], orderByParam = 'name', sortOrderParam = 'asc') {
    const cacheKey = JSON.stringify({ collectionName, dbQuery, orderByParam, sortOrderParam });
    this.queryCache.delete(cacheKey);
  }

  /**
   * Copy-on-write split of a document shared by several tenants.
   *
   * When the current tenant edits a document whose `tenants[]` also lists other tenants, the
   * shared document must NOT be mutated. Instead, atomically:
   *   a) create a NEW document (random id) with the edits and `tenants: [currentTenant]`, and
   *   b) remove the current tenant from the source document's `tenants[]`.
   * Both halves in one batch — a partial apply would leave the tenant in two definitions or in
   * none, and nothing in the app would report it (see the `tag-model` skill).
   *
   * @param collectionName the collection holding the shared document
   * @param source the shared document as read (okey set)
   * @param changes the current tenant's edits, merged onto the source
   * @return the key of the new tenant-specific document, or undefined on failure
   */
  public async forkModel<T extends OkrModel>(
    collectionName: string,
    source: T,
    changes: Partial<T>,
    errorMessage?: string,
  ): Promise<string | undefined> {
    if (!isBrowser(this.platformId)) {
      return this.okrError(undefined, 'FirestoreService.forkModel: This method can only be called in the browser context.', true);
    }
    if (!source?.okey) {
      return this.okrError(undefined, 'FirestoreService.forkModel: source.okey is mandatory.', true);
    }
    const tenantId = this.env.tenantId;
    const newKey = generateRandomString(20);
    const forked = removeUndefinedFields(removeKeyFromOkrModel(structuredClone({ ...source, ...changes })));
    forked.tenants = [tenantId];

    try {
      const batch = this.getBatch();
      batch.set(doc(this.firestore, `${collectionName}/${newKey}`), forked);
      batch.update(doc(this.firestore, `${collectionName}/${source.okey}`), { tenants: arrayRemove(tenantId) });
      await batch.commit();
      return newKey;
    }
    catch (ex) {
      console.error(`FirestoreService.forkModel(${collectionName}/${source.okey}) -> ERROR:`, ex);
      return this.okrError(this.toastController, errorMessage ?? `Could not fork model ${collectionName}/${source.okey}.`);
    }
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

  /**
   * Check that a given person is a current user of the application.
   * This is important to avoid opening direct chats to non-users.
   */
  public async isPersonUser(personKey: string): Promise<boolean> {
    try {
      const query = getSystemQuery(this.env.tenantId);
      query.push({ key: 'personKey', operator: '==', value: personKey});
      const user = await this.getDataOnce<UserModel>(UserCollection, query, 'none');
      if (user.length === 1) {
        return true;
      }
      return false;
    }
    catch (ex) {
      console.error(`FirestoreService.isPersonUser(${personKey}) -> ERROR: `, ex);
      return false;
    }
  }
}