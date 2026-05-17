import { Injectable, inject } from '@angular/core';
import { EventInput } from '@fullcalendar/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { CalEventCollection, CalEventModel, UserModel } from '@bk2/shared-models';
import { addTime, die, findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getCaleventIndex } from '@bk2/calevent-util';
import { ActivityService } from '@bk2/activity-data-access';
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
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
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
    if (!calEvent.startDate || calEvent.startDate.length !== 8) die('CalEventService.convertEventModelToCalendarEvent: calEvent ' + calEvent.bkey + ' has invalid start date: ' + calEvent.startDate);
    if (!calEvent.startTime || calEvent.startTime.length !== 5) {
      // fullDay CalEvent have no startTime
      return {
        title: calEvent.name,
        start: this.getIsoDate(calEvent.startDate),
        eventKey: calEvent.bkey,
      };
    } else {  // not a fullday event
      const endTime = addTime(calEvent.startTime, 0, calEvent.durationMinutes);
      return {
        title: calEvent.name,
        start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
        end: this.getIsoDateTime(calEvent.startDate, endTime),
        eventKey: calEvent.bkey,
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
}
