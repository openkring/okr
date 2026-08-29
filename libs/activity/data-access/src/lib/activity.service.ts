import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ensureAppCheckToken, ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ActivityCollection, ActivityModel, AVATAR_INFO_SHAPE, UserModel } from '@okr/shared-models';
import { findByKey, getAvatarInfo, getSystemQuery, getTodayStr, DateFormat } from '@okr/shared-util-core';

import { getActivityIndex, getActivityRoleNeeded } from '@okr/activity-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  // Backoff between attestation attempts when logging an auth event. Attestation is slowest
  // exactly when it matters here — a cold load on a domain with no cached App Check token.
  private readonly AUTH_RETRY_DELAYS_MS = [2000, 10000];

  /*-------------------------- CRUD operations --------------------------------*/

  /**
   * Log a new activity to the database.
   * @param scope activity scope (e.g. 'auth', 'person', 'membership')
   * @param action activity action (e.g. 'login', 'create', 'delete')
   * @param currentUser the user who triggered the activity (author)
   * @param payload optional additional info (e.g. search term, resource key)
   * @returns the document id of the created activity or undefined
   */
  public async log(scope: string, action: string, currentUser: UserModel | undefined, payload = ''): Promise<string | undefined> {
    if (!currentUser) return undefined;
    const author = getAvatarInfo(currentUser, 'user-person');
    if (!author) return undefined;

    try {
      const activity = new ActivityModel(this.env.tenantId);
      activity.timestamp = getTodayStr(DateFormat.StoreDateTime);
      activity.scope = scope;
      activity.action = action;
      activity.payload = payload;
      activity.author = author;
      activity.roleNeeded = getActivityRoleNeeded(scope, action);
      activity.index = getActivityIndex(activity);

      // Audit logging is best-effort: a failed write must never surface a toast to the user.
      return await this.firestoreService.createModel<ActivityModel>(ActivityCollection, activity, undefined, undefined, currentUser, true);
    } catch (ex) {
      console.warn(`ActivityService.log(${scope}/${action}): failed (check Firestore rules for activities collection):`, ex);
      return undefined;
    }
  }

  /**
   * Log an auth event (login/logout/pwdreset/pwdresetConf) where currentUser (UserModel)
   * is not available — the user is signed out during these flows.
   * Uses the email address as author identifier.
   */
  public async logAuth(action: 'login' | 'logout' | 'pwdreset' | 'pwdresetConf', payload: string): Promise<void> {
    try {
      const activity = new ActivityModel(this.env.tenantId);
      activity.timestamp = getTodayStr(DateFormat.StoreDateTime);
      activity.scope = 'auth';
      activity.action = action;
      activity.payload = payload;
      activity.author = { ...AVATAR_INFO_SHAPE, key: '', name1: '', name2: '', modelType: 'user' };
      activity.roleNeeded = 'admin';
      activity.index = getActivityIndex(activity);

      // App Check is ENFORCED on Firestore, and an auth event is written on the login page, i.e.
      // on the coldest possible load: attestation is often still running. Without a token the SDK
      // sends a placeholder one and the backend answers PERMISSION_DENIED before the rules are
      // even evaluated — a write Firestore does not retry and that only produced Sentry noise
      // (SCS-8N, same cause as SCS-8M on sessions). Unlike a session heartbeat this entry is never
      // repeated, so a skipped write is a hole in the audit trail: wait for attestation, and back
      // off and try again when it is slow or blocked. `timestamp` above is already stamped, so a
      // retried entry still carries the time the auth event happened.
      // Logout is the exception: the app is warm (a token is cached, so the first attempt hits) and
      // the caller AWAITS this before signing out — backing off there would stall the sign-out.
      const delays = action === 'logout' ? [] : this.AUTH_RETRY_DELAYS_MS;
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        if (attempt > 0) await this.delay(delays[attempt - 1]);
        if (!await ensureAppCheckToken()) continue;
        // Best-effort: a failed write must never surface a toast to the user. No retry loop here for
        // a rejection: FirestoreService.createModel already re-attests and retries a denied write
        // once (SCS-8N), and a denial that survives a freshly minted token is a real failure it
        // reports to Sentry — repeating it here would only report it again.
        await this.firestoreService.createModel<ActivityModel>(ActivityCollection, activity, undefined, undefined, undefined, true);
        return;
      }
    } catch (ex) {
      console.warn('ActivityService.logAuth: failed to log auth event (check Firestore rules for activities collection):', ex);
    }
  }

  /**
   * Read a single activity by its document id.
   */
  public read(key: string | undefined): Observable<ActivityModel | undefined> {
    return findByKey<ActivityModel>(this.list(), key);
  }

  /**
   * Delete an existing activity (admin only).
   */
  public async delete(activity: ActivityModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ActivityModel>(
      ActivityCollection, activity, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /*-------------------------- LIST / QUERY --------------------------------*/

  /**
   * List all activities ordered by timestamp descending (newest first).
   */
  public list(orderBy = 'timestamp', sortOrder = 'desc'): Observable<ActivityModel[]> {
    return this.firestoreService.searchData<ActivityModel>(
      ActivityCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }
}
