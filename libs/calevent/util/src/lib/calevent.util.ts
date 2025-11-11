import { EventInput } from '@fullcalendar/core';

import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME, DEFAULT_URL, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CalEventModel } from '@bk2/shared-models';
import { DateFormat, getIsoDateTime, getTodayStr, isType } from '@bk2/shared-util-core';

import { CalEventFormModel } from './calevent-form.model';

export function convertCalEventToForm(calEvent: CalEventModel): CalEventFormModel {
  return {
    bkey: calEvent.bkey ?? DEFAULT_KEY,
    tenants: calEvent.tenants ?? DEFAULT_TENANTS,
    name: calEvent.name ?? DEFAULT_NAME,
    type: calEvent.type,
    startDate: calEvent.startDate ?? getTodayStr(),
    startTime: calEvent.startTime ?? DEFAULT_TIME,
    endDate: calEvent.endDate ?? END_FUTURE_DATE_STR,
    endTime: calEvent.endTime ?? DEFAULT_TIME,
    locationKey: calEvent.locationKey ?? DEFAULT_KEY,
    calendars: calEvent.calendars ?? DEFAULT_CALENDARS,
    periodicity: calEvent.periodicity ?? DEFAULT_PERIODICITY,
    repeatUntilDate: calEvent.repeatUntilDate ?? getTodayStr(),
    responsiblePersons: calEvent.responsiblePersons ?? [],
    url: calEvent.url ?? DEFAULT_URL,
    description: calEvent.description ?? DEFAULT_NOTES,
    tags: calEvent.tags ?? DEFAULT_TAGS,
  };
}

export function convertFormToCalEvent(calEvent: CalEventModel | undefined, vm: CalEventFormModel, tenantId: string): CalEventModel {
  calEvent ??= new CalEventModel(tenantId);
  calEvent.name = vm.name ?? DEFAULT_NAME;
  calEvent.type = vm.type ?? DEFAULT_CALEVENT_TYPE;
  calEvent.startDate = vm.startDate ?? getTodayStr(DateFormat.StoreDate);
  calEvent.startTime = vm.startTime ?? DEFAULT_TIME;
  calEvent.endDate = vm.endDate ?? calEvent.startDate;
  calEvent.endTime = vm.endTime ?? DEFAULT_TIME;
  calEvent.locationKey = vm.locationKey ?? DEFAULT_KEY;
  calEvent.calendars = vm.calendars ?? DEFAULT_CALENDARS;
  calEvent.periodicity = vm.periodicity ?? DEFAULT_PERIODICITY;
  calEvent.repeatUntilDate = vm.repeatUntilDate ?? DEFAULT_DATE;
  calEvent.responsiblePersons = vm.responsiblePersons ?? [];
  calEvent.url = vm.url ?? DEFAULT_URL;
  calEvent.description = vm.description ?? DEFAULT_NOTES;
  calEvent.tags = vm.tags ?? DEFAULT_TAGS;
  return calEvent;
}

export function isCalEvent(calEvent: unknown, tenantId: string): calEvent is CalEventModel {
  return isType(calEvent, new CalEventModel(tenantId));
}

/**
 * This function returns the number of days of a - potentially multiday - fullday event or 0 if its is not fullday.
 * if startDate and endDate are the same -> 1 (fullday event)
 * if startDate and endDate are different -> endDate - startDate + 1 (multiday event)
 * @param calEvent
 * @returns
 */
export function fullDayEventLength(calEvent: CalEventModel): number {
  if (!isFullDayEvent(calEvent)) return 0;
  return parseInt(calEvent.endDate) - parseInt(calEvent.startDate) + 1;
}

/**
 * Check whether a CalEvent is fullday or not.
 * A CalEvent is considered a full day event if it does not have a startTime.
 * @param calEvent
 * @returns
 */
export function isFullDayEvent(calEvent: CalEventModel): boolean {
  return !calEvent.startTime || calEvent.startTime.length === 0;
}

export function convertCalEventToFullCalendar(calEvent: CalEventModel): EventInput {
  if (isFullDayEvent(calEvent)) {
    return convertFullDayCalEventToFullCalendar(calEvent);
  } else {
    return convertTimeCalEventToFullCalendar(calEvent);
  }
}

export function convertFullDayCalEventToFullCalendar(calEvent: CalEventModel): EventInput {
  return {
    title: calEvent.name,
    start: calEvent.startDate,
    end: calEvent.endDate,
    allDay: true,
  };
}

export function convertTimeCalEventToFullCalendar(calEvent: CalEventModel): EventInput {
  const _isoStartDateTime = getIsoDateTime(calEvent.startDate, calEvent.startTime);
  const _isoEndDateTime = getIsoDateTime(calEvent.endDate, calEvent.endTime);
  return {
    title: calEvent.name,
    start: _isoStartDateTime,
    end: _isoEndDateTime,
    allDay: false,
  };
}

export function convertFullCalendarToCalEvent(event: EventInput, tenantId: string): CalEventModel {
  // tbd: do this later
  return new CalEventModel(tenantId);
}
