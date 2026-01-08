import { EventInput } from '@fullcalendar/core';

import { CalEventModel } from '@bk2/shared-models';
import { addTime, getIsoDateTime, isType } from '@bk2/shared-util-core';

export function isCalEvent(calEvent: unknown, tenantId: string): calEvent is CalEventModel {
  return isType(calEvent, new CalEventModel(tenantId));
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
    end: calevent.startDate,
    allDay: true,
  };
}

export function convertTimeCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  const isoStartDateTime = getIsoDateTime(calevent.startDate, calevent.startTime);
  const endTime = addTime(calevent.startTime, 0, calevent.durationMinutes);
  const isoEndDateTime = getIsoDateTime(calevent.startDate, endTime);
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