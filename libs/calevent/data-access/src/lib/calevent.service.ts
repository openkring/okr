import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { EventInput } from '@fullcalendar/core';
import { ToastController } from '@ionic/angular/standalone';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { CalEventCollection, CalEventModel, UserModel } from '@bk2/shared/models';
import { saveComment } from '@bk2/comment/util';
import { CalEventTypes, getCategoryAbbreviation } from '@bk2/shared/categories';
import { addIndexElement, createModel, die, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';


@Injectable({
  providedIn: 'root'
})
export class CalEventService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new CalEvent in the database.
   * @param calEvent the CalEventModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created CalEvent
   */
  public async create(calEvent: CalEventModel, currentUser?: UserModel): Promise<string> {
    calEvent.index = this.getSearchIndex(calEvent);
    const _key = await createModel(this.firestore, CalEventCollection, calEvent, this.tenantId, '@calEvent.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, CalEventCollection, _key, '@comment.operation.initial.conf');
    return _key;    
  }

  /**
   * Lookup a CalEvent in the cached list by its document id and return it as an Observable.
   * @param key the document id of the CalEvent
   * @returns an Observable of the CalEventModel
   */
  public read(key: string | undefined): Observable<CalEventModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((calEvents: CalEventModel[]) => {
        return calEvents.find((calEvent: CalEventModel) => calEvent.bkey === key);
      }));
  }

  /**
   * Update a CalEvent in the database with new values.
   * @param calEvent the CalEventModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(calEvent: CalEventModel, confirmMessage = '@calEvent.operation.update'): Promise<void> {
    calEvent.index = this.getSearchIndex(calEvent);
    await updateModel(this.firestore, CalEventCollection, calEvent, confirmMessage, this.toastController);
  }

  /**
   * We are not actually deleting a CalEvent. We are just archiving it.
   * @param calEvent 
   */
  public async delete(calEvent: CalEventModel): Promise<void> {
    calEvent.isArchived = true;
    await this.update(calEvent, '@calEvent.operation.delete');
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(orderBy = 'startDate', sortOrder = 'asc'): Observable<CalEventModel[]> {
    return searchData<CalEventModel>(this.firestore, CalEventCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given CalEvent based on its values.
   * @param calEvent 
   * @returns the index string
   */
  public getSearchIndex(calEvent: CalEventModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', calEvent.name);
    _index = addIndexElement(_index, 'sd', calEvent.startDate);
    // tbd: calendar name
    const _type = calEvent.type ? getCategoryAbbreviation(CalEventTypes, calEvent.type) : 'UNDEF';
    _index = addIndexElement(_index, 'et', _type);
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getEventIndexInfo(): string {
    return 'n:name sd:startDate et:eventType';
  }

  /*-------------------------- event helpers --------------------------------*/
  public convertEventModelToCalendarEvent(calEvent: CalEventModel): EventInput {
    if (!calEvent.startDate || calEvent.startDate.length !== 8) die('CalEventService.convertEventModelToCalendarEvent: calEvent ' + calEvent.bkey + ' has invalid start date: ' + calEvent.startDate);
    if (!calEvent.startTime || calEvent.startTime.length !== 4) {   // fullDay CalEvent have no startTime
      if (!calEvent.endDate || calEvent.endDate.length !== 8) { // same day CalEvent
        return {
          title: calEvent.name,
          start: this.getIsoDate(calEvent.startDate),
          eventKey: calEvent.bkey
        };
      } else {    // multi day event
        return {
          title: calEvent.name,
          start: this.getIsoDate(calEvent.startDate),
          end: this.getIsoDate(calEvent.endDate),
          eventKey: calEvent.bkey
        };
      }
    } else {      // not a fullday event
      const _endTime = (!calEvent.endTime || calEvent.endTime.length !== 4) ? this.getDefaultEndTime(calEvent.startTime) : calEvent.endTime;
      if (!calEvent.endDate || calEvent.endDate.length !== 8) { // same day event
        return {
          title: calEvent.name,
          start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
          end: this.getIsoDateTime(calEvent.startDate, _endTime),
          eventKey: calEvent.bkey
        };
      } else {
        return {
          title: calEvent.name,
          start: this.getIsoDateTime(calEvent.startDate, calEvent.startTime),
          end: this.getIsoDateTime(calEvent.endDate, _endTime),
          eventKey: calEvent.bkey
        };
      }
    }
  }

  private getIsoDate(dateStr: string): string {
    return dateStr.substring(0, 4) + '-' + dateStr.substring(4, 6) + '-' + dateStr.substring(6, 8)
  }

  private getIsoTime(timeStr: string): string {
    return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4) + ':00';
  }

  private getIsoDateTime(dateStr: string, timeStr: string): string {
    return this.getIsoDate(dateStr) + 'T' + this.getIsoTime(timeStr);
  }

  private getDefaultEndTime(startTime: string): string {
    const _startTime = parseInt(startTime);
    let _endTime = _startTime + 100;
    if (_endTime >= 2400) _endTime = _endTime - 2400; 
    return _endTime + '';
  }
}
