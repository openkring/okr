import { Injectable, inject } from '@angular/core';
import { EventInput } from '@fullcalendar/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { CalEventCollection, CalEventModel, UserModel } from '@bk2/shared-models';
import { die, findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getCaleventIndex } from '@bk2/calevent-util';

@Injectable({
  providedIn: 'root',
})
export class CalEventService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new CalEvent in the database.
   * @param calEvent the CalEventModel to store in the database
   * @param currentUser the current user who performs the operation
   * @returns the document id of the newly created CalEvent or undefined if the operation failed
   */
  public async create(calEvent: CalEventModel, currentUser?: UserModel): Promise<string | undefined> {
    calEvent.index = getCaleventIndex(calEvent);
    return await this.firestoreService.createModel<CalEventModel>(CalEventCollection, calEvent, '@calevent.operation.create', currentUser);
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
   * @param confirmMessage an optional confirmation message to show in the UI
   * @returns the key of the updated CalEvent or undefined if the operation failed
   */
  public async update(calEvent: CalEventModel, currentUser?: UserModel, confirmMessage = '@calevent.operation.update'): Promise<string | undefined> {
    calEvent.index = getCaleventIndex(calEvent);
    return await this.firestoreService.updateModel<CalEventModel>(CalEventCollection, calEvent, false, confirmMessage, currentUser);
  }

  /**
   * We are not actually deleting a CalEvent. We are just archiving it.
   * @param calEvent the CalEventModel to archive
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(calEvent: CalEventModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<CalEventModel>(CalEventCollection, calEvent, '@calevent.operation.delete', currentUser);
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
    if (!calEvent.startTime || calEvent.startTime.length !== 4) {
      // fullDay CalEvent have no startTime
      if (!calEvent.endDate || calEvent.endDate.length !== 8) {
        // same day CalEvent
        return {
          title: calEvent.name,
          start: this.getIsoDate(calEvent.startDate),
          eventKey: calEvent.bkey,
        };
      } else {
        // multi day event
        return {
          title: calEvent.name,
          start: this.getIsoDate(calEvent.startDate),
          end: this.getIsoDate(calEvent.endDate),
          eventKey: calEvent.bkey,
        };
      }
    } else {
      // not a fullday event
      const endTime = !calEvent.endTime || calEvent.endTime.length !== 4 ? this.getDefaultEndTime(calEvent.startTime) : calEvent.endTime;
      if (!calEvent.endDate || calEvent.endDate.length !== 8) {
        // same day event
        return {
          title: calEvent.name,
          start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
          end: this.getIsoDateTime(calEvent.startDate, endTime),
          eventKey: calEvent.bkey,
        };
      } else {
        return {
          title: calEvent.name,
          start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
          end: this.getIsoDateTime(calEvent.endDate, endTime),
          eventKey: calEvent.bkey,
        };
      }
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

  private getDefaultEndTime(startTime: string): string {
    const startTimeInt = parseInt(startTime);
    let endTime = startTimeInt + 100;
    if (endTime >= 2400) endTime = endTime - 2400;
    return endTime + '';
  }
}
