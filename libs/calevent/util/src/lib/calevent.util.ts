import { EventInput } from '@fullcalendar/core';

import { CalEventModel, InvitationState } from '@okr/shared-models';
import { addTime, convertDateFormatToString, DateFormat, getIsoDateTime, isPastDate, isType } from '@okr/shared-util-core';

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

/**
 * Check whether a CalEvent lies in the past (i.e. its last day is before today).
 * Used to hide attendance actions (subscribe/unsubscribe) for events that are over.
 * @param calevent
 */
export function isPastCalevent(calevent: CalEventModel): boolean {
  return isPastDate(calevent.endDate || calevent.startDate);
}

/**
 * A personal CalEvent belongs to no calendar: it is created by a plain registered user, shown only
 * to its organiser (responsiblePersons) and its invitees, and never appears in a shared calendar.
 * Personal events support a reduced feature set (no series, no fullDay, no location, no url,
 * no tags, no description, no documents) — see CalEventForm.
 * @param calevent
 */
export function isPersonalCalevent(calevent: CalEventModel): boolean {
  return (calevent.calendars?.length ?? 0) === 0;
}

/**
 * Whether the current user may subscribe/unsubscribe (An-/Abmeldung) to this event. Mirrors the
 * conditions under which CalEventList's ActionSheet offers the attendance buttons:
 * - never for a past event,
 * - an open event is self-service, so everybody may attend,
 * - a closed event only for an invitee, or for the organiser of a personal event (who has no invitation).
 * @param calevent
 * @param hasInvitation true if an invitation for the current user exists on this event
 */
export function canAttendCalevent(calevent: CalEventModel, hasInvitation: boolean): boolean {
  if (isPastCalevent(calevent)) return false;
  if (calevent.isOpen) return true;
  return hasInvitation || isPersonalCalevent(calevent);
}

/**
 * The calendar names on which a plain registered user may create a personal event: the dedicated
 * 'personal' calendar and 'my' (the menu entry every tenant actually ships — /calevent/my/c-calevents).
 * Both list the user's own events, so a new event created there is a personal one.
 * @param calendarName the CalEventStore's current calendar name
 */
export function isPersonalCalendarName(calendarName: string): boolean {
  return calendarName === 'personal' || calendarName === 'my';
}

export function convertCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  if (isFullDayEvent(calevent)) {
    return convertFullDayCalEventToFullCalendar(calevent);
  } else {
    return convertTimeCalEventToFullCalendar(calevent);
  }
}

export function convertFullDayCalEventToFullCalendar(calevent: CalEventModel): EventInput {
  // Single-day all-day event: omit `end`. FullCalendar's all-day `end` is EXCLUSIVE, so
  // end === start would render a zero-length event; with no end it defaults to a 1-day span.
  return {
    title: calevent.name,
    start: calevent.startDate,
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

/*-------------------------- SERIES --------------------------------*/
/**
 * The fields a series edit propagates to its sibling occurrences.
 * Everything else is either per-occurrence (okey, startDate, attendees — one occurrence's
 * attendance must never overwrite another's) or must not be touched by an edit (tenants,
 * isArchived).
 * @param edited the edited occurrence, carrying the new values
 * @param startDate the date of the target occurrence (its own, possibly shifted, date)
 * @returns a plain object ready for a Firestore update()
 */
export function getSeriesUpdateFields(edited: CalEventModel, startDate: string): Record<string, unknown> {
  const target = { ...edited, startDate };
  return {
    name: target.name,
    description: target.description,
    type: target.type,
    tags: target.tags,
    startDate,
    startTime: target.startTime,
    fullDay: target.fullDay,
    durationMinutes: target.durationMinutes,
    endDate: target.endDate,
    periodicity: target.periodicity,
    repeatUntilDate: target.repeatUntilDate,
    seriesId: target.seriesId,
    locationKey: target.locationKey,
    calendars: target.calendars,
    url: target.url,
    urlLabel: target.urlLabel,
    responsiblePersons: target.responsiblePersons,
    isOpen: target.isOpen,
    state: target.state,
    cancelMessage: target.cancelMessage ?? '',
    index: getCaleventIndex(target)
  };
}

export type SeriesPlan = {
  updates: { event: CalEventModel; startDate: string }[]; // occurrences that survive, with their (possibly shifted) date
  archives: CalEventModel[];                              // occurrences dropped because the range shrank
  creates: string[];                                      // dates that have no occurrence yet
};

/**
 * Reconciles the occurrences of a series against the dates it should have after an edit.
 * Pairing is positional on the date-sorted lists, so an unchanged prefix keeps its documents —
 * and with them its attendees and invitations.
 * @param affected the existing occurrences in scope, sorted by startDate ascending
 * @param dates the recalculated dates for exactly those occurrences, sorted ascending
 */
export function planSeriesReconcile(affected: CalEventModel[], dates: string[]): SeriesPlan {
  return {
    updates: affected.slice(0, dates.length).map((event, i) => ({ event, startDate: dates[i] })),
    archives: affected.slice(dates.length),
    creates: dates.slice(affected.length)
  };
}

/*-------------------------- SEARCH --------------------------------*/
export function getCaleventIndex(calevent: CalEventModel): string {
  const persons = calevent.responsiblePersons.map(p => p.name2).join(',');
  return 'd:' + calevent.startDate + ' n:' + calevent.name + ' p:' + persons + ' l:' + calevent.locationKey + ' c:' + calevent.calendars.join(',');
}

export function getCaleventIndexInfo(): string {
  return 'd:ate n:ame p:ersons l:ocationKey c:alendars';
}

/*-------------------------- SCHEDULE POLL --------------------------------*/
export function isSchedulePoll(events: CalEventModel[]): boolean {
  return events.some(e => e.state === 'proposed');
}

export function getCalEventCssClass(state: CalEventModel['state']): string {
  if (state === 'proposed') return 'state-proposed';
  if (state === 'provisional') return 'state-provisional';
  if (state === 'cancelled') return 'state-cancelled';
  return '';
}

export function formatScheduleCloseMessage(
  eventName: string,
  startDate: string,
  authorMessage?: string
): string {
  const date = convertDateFormatToString(startDate, DateFormat.StoreDate, DateFormat.ViewDate);
  const lines = [`✅ ${eventName}`, `Termin: ${date}`];
  if (authorMessage?.trim()) lines.push(authorMessage.trim());
  return lines.join('\n');
}

/** Cell cycle in the poll table: no answer -> yes -> no -> no answer. 'maybe' is unused here. */
export function nextInvitationState(state: InvitationState): InvitationState {
  if (state === 'accepted') return 'declined';
  if (state === 'declined') return 'pending';
  return 'accepted';
}

/** Index of the column with the most acceptances; -1 when nobody accepted anything. */
export function bestScheduleColumn(counts: number[]): number {
  let best = -1;
  let max = 0;
  counts.forEach((count, index) => {
    if (count > max) {
      max = count;
      best = index;
    }
  });
  return best;
}

/** Deep link that reopens the poll: the calevent list route plus a `poll` query param. */
export function buildSchedulePollLink(origin: string, calendarKey: string, seriesId: string): string {
  return `${origin.replace(/\/$/, '')}/calevent/${calendarKey}/c-calevents?poll=${seriesId}`;
}

export function formatSchedulePollInviteMessage(name: string, link: string): string {
  return `📅 ${name}\nBitte diese Terminumfrage ausfüllen: ${link}`;
}
