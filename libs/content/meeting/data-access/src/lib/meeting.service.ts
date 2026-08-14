import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { MeetingCollection, MeetingModel, TaskCollection, TaskModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { getMeetingIndex, getMeetingRelatedKey, isOpenTask } from '@okr/content-meeting-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class MeetingService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(meeting: MeetingModel, currentUser?: UserModel): Promise<string | undefined> {
    meeting.index = getMeetingIndex(meeting);
    const key = await this.firestoreService.createModel<MeetingModel>(MeetingCollection, meeting, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('meeting', 'create', currentUser, `${key}:${meeting.name}`);
    return key;
  }

  public read(key: string): Observable<MeetingModel | undefined> {
    return this.firestoreService.readModel<MeetingModel>(MeetingCollection, key);
  }

  public async update(meeting: MeetingModel, currentUser?: UserModel): Promise<string | undefined> {
    meeting.index = getMeetingIndex(meeting);
    const key = await this.firestoreService.updateModel<MeetingModel>(MeetingCollection, meeting, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('meeting', 'update', currentUser, `${key}:${meeting.name}`);
    return key;
  }

  public async delete(meeting: MeetingModel, currentUser?: UserModel): Promise<void> {
    const payload = `${meeting.okey}:${meeting.name}`;
    await this.firestoreService.deleteModel<MeetingModel>(MeetingCollection, meeting, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('meeting', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'meetingDate', sortOrder = 'desc'): Observable<MeetingModel[]> {
    return this.firestoreService.searchData<MeetingModel>(MeetingCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- ACTION ITEMS --------------------------------*/
  /**
   * The tasks created from a meeting's agenda. Tasks carry the back-link in
   * `relatedKey` (spec 1.35); a second array-contains on the tenants filter is not
   * possible, so the tenant-scoped task stream is filtered client-side — the same
   * approach FolderService.listByParent uses, and it reuses the cached stream.
   * @param meetingKey okey of the meeting
   */
  public listActionItems(meetingKey: string): Observable<TaskModel[]> {
    const relatedKey = getMeetingRelatedKey(meetingKey);
    return this.firestoreService.searchData<TaskModel>(
      TaskCollection, getSystemQuery(this.tenantId), 'dueDate', 'asc'
    ).pipe(
      // legacy tasks have no relatedKey at all (Firestore reads skip model defaults)
      map(tasks => tasks.filter(t => (t.relatedKey ?? '') === relatedKey))
    );
  }

  /** The still-open action items of a meeting — the carry-over source for the next one. */
  public listOpenActionItems(meetingKey: string): Observable<TaskModel[]> {
    return this.listActionItems(meetingKey).pipe(map(tasks => tasks.filter(isOpenTask)));
  }
}
