import { EventInput } from '@fullcalendar/core';

import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CalEventModel, CalEventType, Periodicity } from '@bk2/shared-models';
import { DateFormat, getIsoDateTime, getTodayStr, isType } from '@bk2/shared-util-core';

import { CalEventFormModel } from './calevent-form.model';

export function convertCalEventToForm(calEvent: CalEventModel): CalEventFormModel {
  return {
    bkey: calEvent.bkey ?? '',
    tenants: calEvent.tenants,
    name: calEvent.name ?? '',
    type: calEvent.type,
    startDate: calEvent.startDate ?? getTodayStr(),
    startTime: calEvent.startTime ?? '',
    endDate: calEvent.endDate ?? END_FUTURE_DATE_STR,
    endTime: calEvent.endTime ?? '',
    locationKey: calEvent.locationKey ?? '',
    calendars: calEvent.calendars ?? [],
    periodicity: calEvent.periodicity ?? Periodicity.Once,
    repeatUntilDate: calEvent.repeatUntilDate ?? getTodayStr(),
    responsiblePersons: calEvent.responsiblePersons ?? [],
    url: calEvent.url ?? '',
    description: calEvent.description ?? '',
    tags: calEvent.tags ?? '',
  };
}

export function convertFormToCalEvent(calEvent: CalEventModel | undefined, vm: CalEventFormModel, tenantId: string): CalEventModel {
  calEvent ??= new CalEventModel(tenantId);
  calEvent.name = vm.name ?? '';
  calEvent.type = vm.type ?? CalEventType.SocialEvent;
  calEvent.startDate = vm.startDate ?? getTodayStr(DateFormat.StoreDate);
  calEvent.startTime = vm.startTime ?? '';
  calEvent.endDate = vm.endDate ?? calEvent.startDate;
  calEvent.endTime = vm.endTime ?? '';
  calEvent.locationKey = vm.locationKey ?? '';
  calEvent.calendars = vm.calendars ?? '';
  calEvent.periodicity = vm.periodicity ?? Periodicity.Once;
  calEvent.repeatUntilDate = vm.repeatUntilDate ?? '';
  calEvent.responsiblePersons = vm.responsiblePersons ?? [];
  calEvent.url = vm.url ?? '';
  calEvent.description = vm.description ?? '';
  calEvent.tags = vm.tags ?? '';
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
