import { EventInput } from '@fullcalendar/core';

import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME, DEFAULT_URL, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AvatarInfo, CalEventModel } from '@bk2/shared-models';
import { DateFormat, die, getIsoDateTime, getTodayStr, isType } from '@bk2/shared-util-core';

import { CalEventFormModel } from './calevent-form.model';

export function convertCalEventToForm(calevent: CalEventModel): CalEventFormModel {
  return {
    bkey: calevent.bkey ?? DEFAULT_KEY,
    tenants: calevent.tenants ?? DEFAULT_TENANTS,
    name: calevent.name ?? DEFAULT_NAME,
    type: calevent.type ?? DEFAULT_CALEVENT_TYPE,
    startDate: calevent.startDate ?? getTodayStr(),
    startTime: calevent.startTime ?? DEFAULT_TIME,
    endDate: calevent.endDate ?? END_FUTURE_DATE_STR,
    endTime: calevent.endTime ?? DEFAULT_TIME,
    locationKey: calevent.locationKey ?? DEFAULT_KEY,
    calendars: calevent.calendars ?? DEFAULT_CALENDARS,
    periodicity: calevent.periodicity ?? DEFAULT_PERIODICITY,
    repeatUntilDate: calevent.repeatUntilDate ?? getTodayStr(),
    responsiblePersons: calevent.responsiblePersons ?? [] as AvatarInfo[],
    url: calevent.url ?? DEFAULT_URL,
    description: calevent.description ?? DEFAULT_NOTES,
    tags: calevent.tags ?? DEFAULT_TAGS,
  };
}

export function convertFormToCalEvent(vm?: CalEventFormModel, calevent?: CalEventModel | undefined): CalEventModel {
  if (!calevent) die('profile.util.convertFormToCalEvent: User is mandatory.');
  if (!vm) return calevent;
  
  calevent.name = vm.name ?? DEFAULT_NAME;
  calevent.type = vm.type ?? DEFAULT_CALEVENT_TYPE;
  calevent.startDate = vm.startDate ?? getTodayStr(DateFormat.StoreDate);
  calevent.startTime = vm.startTime ?? DEFAULT_TIME;
  calevent.endDate = vm.endDate ?? calevent.startDate;
  calevent.endTime = vm.endTime ?? DEFAULT_TIME;
  calevent.locationKey = vm.locationKey ?? DEFAULT_KEY;
  calevent.calendars = vm.calendars ?? DEFAULT_CALENDARS;
  calevent.periodicity = vm.periodicity ?? DEFAULT_PERIODICITY;
  calevent.repeatUntilDate = vm.repeatUntilDate ?? DEFAULT_DATE;
  calevent.responsiblePersons = vm.responsiblePersons ?? [] as AvatarInfo[];
  calevent.url = vm.url ?? DEFAULT_URL;
  calevent.description = vm.description ?? DEFAULT_NOTES;
  calevent.tags = vm.tags ?? DEFAULT_TAGS;
  calevent.index = getCaleventIndex(calevent);
  return calevent;
}

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
  return 'n:' + calevent.name + ' st:' + calevent.startDate;
}

export function getCaleventIndexInfo(): string {
  return 'n:ame st:artDate';
}