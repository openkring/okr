import { Injectable, inject } from '@angular/core';
import type { EventInput } from '@fullcalendar/core';
import { getApp } from 'firebase/app';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CalEventCollection, CalEventModel, UserModel } from '@okr/shared-models';
import { addTime, die, findByKey, getSystemQuery } from '@okr/shared-util-core';

import { getCaleventIndex, NotifyScope } from '@okr/calevent-util';
import { ActivityService } from '@okr/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root',
})
export class CalEventService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new CalEvent in the database.
   * @param calEvent the CalEventModel to store in the database
   * @param currentUser the current user who performs the operation
   * @returns the document id of the newly created CalEvent or undefined if the operation failed
   */
  public async create(calEvent: CalEventModel, currentUser?: UserModel): Promise<string | undefined> {
    calEvent.index = getCaleventIndex(calEvent);
    const key = await this.firestoreService.createModel<CalEventModel>(CalEventCollection, calEvent, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${calEvent.startDate} ${calEvent.startTime}: ${calEvent.name}`;
    void this.activityService.log('calevent', 'create', currentUser, payload);
    return key;
  }

  /**
   * Lookup a CalEvent in the cached list by its document id and return it as an Observable.
   * @param key the document id of the CalEvent
   * @returns an Observable of the CalEventModel or undefined if not found
   */
  public read(key: string | undefined): Observable<CalEventModel | undefined> {
    return findByKey<CalEventModel>(this.list(), key);
  }

  /**
   * Update a CalEvent in the database with new values.
   * @param calEvent the CalEventModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the current user who performs the operation
   * @returns the key of the updated CalEvent or undefined if the operation failed
   */
  public async update(calEvent: CalEventModel, currentUser?: UserModel): Promise<string | undefined> {
    calEvent.index = getCaleventIndex(calEvent);
    const key = await this.firestoreService.updateModel<CalEventModel>(CalEventCollection, calEvent, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${calEvent.startDate} ${calEvent.startTime}: ${calEvent.name}`;
    void this.activityService.log('calevent', 'update', currentUser, payload);
    return key;
  }

  /**
   * We are not actually deleting a CalEvent. We are just archiving it.
   * @param calEvent the CalEventModel to archive
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(calEvent: CalEventModel, currentUser?: UserModel): Promise<void> {
    const payload = `${calEvent.startDate} ${calEvent.startTime}: ${calEvent.name}`;
    await this.firestoreService.deleteModel<CalEventModel>(CalEventCollection, calEvent, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('calevent', 'delete', currentUser, payload);
  }

  /**
   * Audit entry for a write that goes through a Firestore WriteBatch and therefore never passes
   * `create`/`update`/`delete`. Every series operation is such a write: reconciling a rule,
   * archiving a range and saving a whole column of poll answers all commit one batch, so before
   * this existed the entire series half of the feature left no trace at all. Reconstructing the
   * 2026-06-10 triple-series incident was only possible because the per-occurrence `create` entries
   * happened to be logged — the edit that broke the series was not.
   *
   * One entry per OPERATION, not per document: a reconcile touching 29 occurrences is one decision
   * a person made, and 29 rows would bury it.
   *
   * @param action 'series-create' | 'series-update' | 'series-delete' | 'series-attendance' | 'poll-close'
   * @param payload a human-readable summary; keep the series id in it, it is the join key
   * @param currentUser the user who triggered the operation
   */
  public logSeriesActivity(action: string, payload: string, currentUser?: UserModel): void {
    void this.activityService.log('calevent', action, currentUser, payload);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  /**
   * Lists all calendar events in the database.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of calendar events
   */
  public list(orderBy = 'startDate', sortOrder = 'asc'): Observable<CalEventModel[]> {
    return this.firestoreService.searchData<CalEventModel>(CalEventCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- event helpers --------------------------------*/
  public convertEventModelToCalendarEvent(calEvent: CalEventModel): EventInput {
    if (!calEvent.startDate || calEvent.startDate.length !== 8) die('CalEventService.convertEventModelToCalendarEvent: calEvent ' + calEvent.okey + ' has invalid start date: ' + calEvent.startDate);
    if (!calEvent.startTime || calEvent.startTime.length !== 5) {
      // fullDay CalEvent have no startTime
      return {
        title: calEvent.name,
        start: this.getIsoDate(calEvent.startDate),
        eventKey: calEvent.okey,
      };
    } else {  // not a fullday event
      const endTime = addTime(calEvent.startTime, 0, calEvent.durationMinutes);
      return {
        title: calEvent.name,
        start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
        end: this.getIsoDateTime(calEvent.startDate, endTime),
        eventKey: calEvent.okey,
      };
    }
  }

  private getIsoDate(dateStr: string): string {
    return dateStr.substring(0, 4) + '-' + dateStr.substring(4, 6) + '-' + dateStr.substring(6, 8);
  }

  private getIsoTime(timeStr: string): string {
    return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4) + ':00';
  }

  private getIsoDateTime(dateStr: string, timeStr: string): string {
    return this.getIsoDate(dateStr) + 'T' + this.getIsoTime(timeStr);
  }

  /*-------------------------- participant broadcast --------------------------------*/
  /**
   * Send a short notice to the participants of an event
   * (spec `2026-08-25-participant-messaging-spec.md` §1).
   *
   * Only the event key, the text and the scope travel — never a recipient list. The Cloud
   * Function derives who is addressed from the event's own attendees/invitations, checks that
   * the caller is an organiser, and delivers on two channels (push + the system bot's existing
   * direct message per person, so no chat room is created).
   *
   * @param caleventKey the event to notify about
   * @param message     the notice, max 500 characters
   * @param scope       'event' for this occurrence, 'series' for this and all future ones
   * @returns how many people were reached
   */
  public async notifyParticipants(caleventKey: string, message: string, scope: NotifyScope): Promise<number> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fn = httpsCallable<{ caleventKey: string; message: string; scope: NotifyScope }, { recipients: number }>(
      getFunctions(getApp(), 'europe-west6'), 'notifyCalEventParticipants');
    const result = await fn({ caleventKey, message, scope });
    return result.data.recipients;
  }
}
