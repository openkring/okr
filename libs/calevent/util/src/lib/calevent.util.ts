import { EventInput } from '@fullcalendar/core';

import { CalEventModel } from '@bk2/shared-models';
import { getIsoDateTime, isType } from '@bk2/shared-util-core';

export function isCalEvent(calEvent: unknown, tenantId: string): calEvent is CalEventModel {
  return isType(calEvent, new CalEventModel(tenantId));
}

/**
 * This function returns the number of days of a - potentially multiday - fullday event or 0 if its is not fullday.
 * if startDate and endDate are the same -> 1 (fullday event)
 * if startDate and endDate are different -> endDate - startDate + 1 (multiday event)
 * @param calevent
 * @returns
 */
export function fullDayEventLength(calevent: CalEventModel): number {
  if (!isFullDayEvent(calevent)) return 0;
  return parseInt(calevent.endDate) - parseInt(calevent.startDate) + 1;
}

/**
 * Check whether a CalEvent is fullday or not.
 * A CalEvent is considered a full day event if it does not have a startTime.
 * @param calevent
 * @returns
 */
export function isFullDayEvent(calevent: CalEventModel): boolean {
  return !calevent.startTime || calevent.startTime.length === 0;
}

export function convertCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  if (isFullDayEvent(calevent)) {
    return convertFullDayCalEventToFullCalendar(calevent);
  } else {
    return convertTimeCalEventToFullCalendar(calevent);
  }
}

export function convertFullDayCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  return {
    title: calevent.name,
    start: calevent.startDate,
    end: calevent.endDate,
    allDay: true,
  };
}

export function convertTimeCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  const isoStartDateTime = getIsoDateTime(calevent.startDate, calevent.startTime);
  const isoEndDateTime = getIsoDateTime(calevent.endDate, calevent.endTime);
  return {
    title: calevent.name,
    start: isoStartDateTime,
    end: isoEndDateTime,
    allDay: false,
  };
}

export function convertFullCalendarToCalEvent(event: EventInput, tenantId: string): CalEventModel {
  // tbd: convertFullCalendarToCalEvent
  return new CalEventModel(tenantId);
}

/*-------------------------- SEARCH --------------------------------*/
export function getCaleventIndex(calevent: CalEventModel): string {
  const persons = calevent.responsiblePersons.map(p => p.name2).join(',');
  return 'n:' + calevent.name + ' p:' + persons + ' l:' + calevent.locationKey + ' c:' + calevent.calendars.join(',');
}

export function getCaleventIndexInfo(): string {
  return 'n:ame p:ersons l:ocationKey c:alendars';
}