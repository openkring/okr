import type { EventInput } from '@fullcalendar/core';

import { Attendee, AvatarInfo, CalEventModel, InvitationState } from '@okr/shared-models';
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
 * Personal events support a reduced feature set (no series, no fullDay, no location,
 * no tags, no description, no documents) — see CalEventForm. A link (url/urlLabel) is
 * still offered, since it needs no calendar to be meaningful.
 * @param calevent
 */
export function isPersonalCalevent(calevent: CalEventModel): boolean {
  return (calevent.calendars?.length ?? 0) === 0;
}

/**
 * Whether the current user may subscribe/unsubscribe (An-/Abmeldung) to this event. Mirrors the
 * conditions under which CalEventList's ActionSheet offers the attendance buttons:
 * - never for a past event,
 * - an open event is self-service — but only for those `canJoinOpen` lets in,
 * - a closed event only for an invitee, or for the organiser of a personal event (who has no invitation).
 * @param calevent
 * @param hasInvitation true if an invitation for the current user exists on this event
 * @param canJoinOpen   false only for an open event on a group calendar the user does not belong
 *                      to; derive it with {@link mayJoinOpenCalevent}. Defaults to true so every
 *                      caller that has nothing to do with group calendars keeps the old behaviour.
 */
export function canAttendCalevent(calevent: CalEventModel, hasInvitation: boolean, canJoinOpen = true): boolean {
  if (isPastCalevent(calevent)) return false;
  if (calevent.isOpen) return canJoinOpen;
  return hasInvitation || isPersonalCalevent(calevent);
}

/**
 * Open sign-up on a GROUP calendar is for that group's members, not for the whole tenant.
 *
 * The distinction exists because of the schedule poll: its events are open so that a member who
 * ignored the poll can still answer after it closed — not so that anyone browsing /calevent/all
 * can join a group's training. Events outside a group calendar are unaffected: an open club event
 * stays open to everybody.
 *
 * @param eventCalendars    `calevent.calendars`
 * @param groupCalendarKeys okeys of every calendar owned by a group (`owner` starts with 'group.')
 * @param myCalendarKeys    okeys of the calendars owned by an org the current user belongs to
 */
export function mayJoinOpenCalevent(
  eventCalendars: string[] | undefined,
  groupCalendarKeys: string[],
  myCalendarKeys: string[],
): boolean {
  const calendars = eventCalendars ?? [];
  const onGroupCalendar = calendars.some(key => groupCalendarKeys.includes(key));
  if (!onGroupCalendar) return true;
  return calendars.some(key => myCalendarKeys.includes(key));
}

/**
 * An invitation state expressed in the narrower attendee vocabulary. The schedule poll only ever
 * cycles pending -> accepted -> declined (see {@link nextInvitationState}), so 'maybe' is
 * unreachable from there; it is folded into 'invited' rather than silently dropped.
 */
export function toAttendeeState(state: InvitationState): Attendee['state'] {
  if (state === 'accepted') return 'accepted';
  if (state === 'declined') return 'declined';
  return 'invited';
}

/** The attendee vocabulary widened back: 'invited' is the invitation's 'pending'. */
export function toInvitationState(state: Attendee['state']): InvitationState {
  return state === 'invited' ? 'pending' : state;
}

/**
 * The attendee list with one person's answer set — or their entry removed when they reset it to
 * 'pending'. A missing answer is an ABSENT attendee, never an 'invited' one: that is what keeps a
 * schedule poll from filling the calevent with rows nobody wrote.
 *
 * Pure and total, and deliberately so: `saveSchedulePollResponses` runs it inside a Firestore
 * transaction, which may replay the callback against a fresher snapshot. Everyone else's entries
 * are carried over untouched, so a replay can never drop a concurrent answer.
 */
export function mergeAttendee(
  attendees: Attendee[] | undefined,
  person: AvatarInfo,
  state: InvitationState,
  comment = '',
): Attendee[] {
  const others = (attendees ?? []).filter(attendee => attendee.person.key !== person.key);
  if (state === 'pending') return others;
  const merged: Attendee = { person, state: toAttendeeState(state) };
  if (comment.length > 0) merged.comment = comment;
  return [...others, merged];
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

/**
 * Resolves the `calendars` array a newly created event must be stored under, from the name of the
 * VIEW it was created in.
 *
 * 'all', 'my' and '' are VIEW names, not calendars — no `calendars` document carries those okeys,
 * so an event stored under one of them matches no calendar filter and silently disappears from
 * every list except /calevent/all. Seen on elab: two events written with `calendars: ['all']` by
 * the quick entry never showed up in the "Nächste Anlässe" dashboard section, which filters on
 * 'my'. Such an event belongs to the tenant-wide calendar, whose okey is the tenant id.
 *
 * 'personal' resolves to no calendar at all — that is what makes an event personal
 * ({@link isPersonalCalevent}).
 *
 * @param calendarName the CalEventStore's current calendar name (a view name or a calendar okey)
 * @param tenantId     the current tenant — okey of the tenant-wide calendar
 */
export function resolveCalendars(calendarName: string | undefined, tenantId: string): string[] {
  const name = calendarName ?? '';
  if (name === 'personal') return [];
  if (name.length === 0 || name === 'all' || name.startsWith('my')) return [tenantId];
  return [name];
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

/**
 * Group-chat notification when the organizer closes a poll. `startDates` holds EVERY confirmed
 * date: one in single-select mode, several in 'Mehrere Termine festlegen'. Sorted here rather than
 * by the caller — StoreDate is yyyyMMdd, so a plain string sort is chronological.
 */
export function formatScheduleCloseMessage(
  eventName: string,
  startDates: string[],
  authorMessage?: string
): string {
  const dates = [...startDates].sort()
    .map(startDate => convertDateFormatToString(startDate, DateFormat.StoreDate, DateFormat.ViewDate));
  const lines = [`✅ ${eventName}`];
  if (dates.length === 1) lines.push(`Termin: ${dates[0]}`);
  else if (dates.length > 1) lines.push('Termine:', ...dates);
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

/**
 * Deep link auf einen einzelnen Termin: die Listenroute plus ein `event`-Query-Param.
 *
 * Warum kein `/calevent/<okey>`: die Route ist `:listId/:contextMenuName` — ein okey würde als
 * `listId` binden und eine LEERE Liste rendern statt des Termins. Deshalb dasselbe Muster wie
 * `buildSchedulePollLink`: die Liste lädt normal und öffnet den Termin danach selbst.
 *
 * `listId` ist bewusst 'all' und nicht der Kalender des Termins — der Empfänger des Links muss
 * den Kalender nicht abonniert haben, um den Termin zu sehen.
 */
export function buildCalEventLink(origin: string, okey: string): string {
  return `${origin.replace(/\/$/, '')}/calevent/all/c-calevents?event=${okey}`;
}

/**
 * Formats a duration given in minutes as a readable label ('90' -> '1 h 30 min').
 * Shown as the helper of the duration field: the value stays durationMinutes, only the
 * hint below it spells the number out.
 * @param durationMinutes the duration in minutes
 * @returns '' for an empty/invalid/zero duration, else '1 h 30 min' / '2 h' / '45 min'
 */
export function formatDurationLabel(durationMinutes?: number | null): string {
  const total = Number(durationMinutes);
  if (!Number.isFinite(total) || total <= 0) return '';
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** An attendee list split into the three blocks the attendees accordion renders. */
export type AttendeeSplit = {
  confirmed: Attendee[]; // accepted, within the cap
  waiting: Attendee[];   // accepted, but the cap was already full when they signed up
  others: Attendee[];    // 'invited' / 'declined' — they occupy no slot
};

/**
 * Splits the attendees into confirmed, waiting and the rest.
 *
 * The waiting list is DERIVED, never stored: among the entries with state 'accepted', the first
 * `maxAttendees` (in array order, which is sign-up order — `changeAttendanceState` pushes) are
 * confirmed and the remainder waits. That is what makes the list self-healing: a confirmed person
 * who unsubscribes drops out of the accepted set, and the next one moves up without a second write.
 *
 * Only 'accepted' competes for a slot. A declined or merely invited person occupies none, so
 * declining never blocks the queue.
 *
 * @param attendees   `calevent.attendees`; undefined on a legacy document
 * @param maxAttendees `calevent.maxAttendees`; 0, negative or undefined all mean unrestricted
 */
export function splitAttendees(attendees: Attendee[] | undefined, maxAttendees: number | undefined): AttendeeSplit {
  const all = attendees ?? [];
  const accepted = all.filter(attendee => attendee.state === 'accepted');
  const others = all.filter(attendee => attendee.state !== 'accepted');
  const cap = maxAttendees ?? 0;
  if (cap <= 0) return { confirmed: accepted, waiting: [], others };
  return { confirmed: accepted.slice(0, cap), waiting: accepted.slice(cap), others };
}

/**
 * Whether the event has reached its participant cap — the moment a further sign-up lands on the
 * waiting list rather than in the event. An uncapped event is never full.
 * @param calevent the event to check
 */
export function isCaleventFull(calevent: CalEventModel): boolean {
  const cap = calevent.maxAttendees ?? 0;
  if (cap <= 0) return false;
  return (calevent.attendees ?? []).filter(attendee => attendee.state === 'accepted').length >= cap;
}
