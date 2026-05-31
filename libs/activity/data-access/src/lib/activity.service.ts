import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { ActivityCollection, ActivityModel, AVATAR_INFO_SHAPE, UserModel } from '@bk2/shared-models';
import { findByKey, getAvatarInfo, getSystemQuery, getTodayStr, DateFormat } from '@bk2/shared-util-core';

import { getActivityIndex, getActivityRoleNeeded } from '@bk2/activity-util';
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

      return await this.firestoreService.createModel<ActivityModel>(ActivityCollection, activity, undefined, undefined, currentUser);
    } catch (ex) {
      console.warn(`ActivityService.log(${scope}/${action}): failed (check Firestore rules for activities collection):`, ex);
      return undefined;
    }
  }

  /**
   * Log an auth event (login/logout) where currentUser (UserModel) is not yet available.
   * Uses the email address as author identifier.
   */
  public async logAuth(action: 'login' | 'logout', payload: string): Promise<void> {
    try {
      const activity = new ActivityModel(this.env.tenantId);
      activity.timestamp = getTodayStr(DateFormat.StoreDateTime);
      activity.scope = 'auth';
      activity.action = action;
      activity.payload = payload;
      activity.author = { ...AVATAR_INFO_SHAPE, key: '', name1: '', name2: '', modelType: 'user' };
      activity.roleNeeded = 'admin';
      activity.index = getActivityIndex(activity);
      await this.firestoreService.createModel<ActivityModel>(ActivityCollection, activity, undefined, undefined, undefined);
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
