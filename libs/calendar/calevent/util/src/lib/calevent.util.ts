import type { EventInput } from '@fullcalendar/core';

import { DEFAULT_CALEVENT_TYPE, PERSONAL_CALENDAR_KEY, TRIP_CALEVENT_TYPE } from '@okr/shared-constants';
import { Attendee, AvatarInfo, CalendarModel, CalEventModel, CategoryListModel, InvitationModel, InvitationState } from '@okr/shared-models';
import { addTime, applyInvitationAnswer, defaultItemName, convertDateFormatToString, DateFormat, getAttendanceState, getAttendee, getEventLocationName, getIsoDateTime, isCaleventAttendanceClosed, isPastDate, isType, toAttendeeState } from '@okr/shared-util-core';

export { applyInvitationAnswer, toAttendeeState };

/** A new event a user starts: its type is one the tenant offers (`types` = the `calevent_type` list). */
export function newCalEvent(tenantId: string, types: CategoryListModel | undefined): CalEventModel {
  const event = new CalEventModel(tenantId);
  event.type = defaultItemName(types, DEFAULT_CALEVENT_TYPE);
  return event;
}

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
 * Whether An-/Abmeldung is closed on this event, regardless of who asks: it is over, locked by the
 * organiser, or called off (state 'cancelled'). The one rule every attendance action and write
 * path checks — the calendar list, the yearly view, the attendees accordion and the dashboard
 * widgets alike. Delegates to `isCaleventAttendanceClosed` in `@okr/shared-util-core`, which the
 * invitation badge rule shares.
 * @param calevent
 */
export function isAttendanceClosed(calevent: CalEventModel): boolean {
  return isCaleventAttendanceClosed(calevent);
}

/** An event created from a public-transport connection (spec 1.162). */
export function isTripCalevent(e: Pick<CalEventModel, 'type'>): boolean {
  return e.type === TRIP_CALEVENT_TYPE;
}

/**
 * A personal CalEvent belongs to no calendar: it is created by a plain registered user, shown only
 * to its organiser (responsiblePersons) and its invitees, and never appears in a shared calendar.
 * Personal events support a reduced feature set (no series, no fullDay, no location,
 * no tags, no description, no documents) — see CalEventForm. Exception: a trip event
 * (type 'travel', spec 1.162) keeps its location and leg list even when personal. A link (url/urlLabel) is
 * still offered, since it needs no calendar to be meaningful.
 * @param calevent
 */
export function isPersonalCalevent(calevent: CalEventModel): boolean {
  return (calevent.calendars?.length ?? 0) === 0;
}

/**
 * Whether the current user may subscribe/unsubscribe (An-/Abmeldung) to this event. Mirrors the
 * conditions under which CalEventList's ActionSheet offers the attendance buttons.
 *
 * Since 2026-09 every event is open; what used to be `isOpen` is now the REACH of the calendar it
 * belongs to (planning/specs/2026-09-06-open-events-invitation-model-spec.md). Three ways in, and
 * the order is how to read them, not a precedence:
 * - `canJoinOpen`   — within the reach: a member of the owning group, or an event outside a group
 *                     calendar altogether;
 * - `hasInvitation` — invited to exactly this occurrence, which is what an invitation is FOR: it
 *                     reaches someone the calendar does not;
 * - a personal event — its organiser is neither of the two.
 *
 * Never for a past, locked or cancelled event ({@link isAttendanceClosed}).
 *
 * @param calevent
 * @param hasInvitation true if an invitation for the current user exists on this event
 * @param canJoinOpen   false only on a group calendar the user does not belong to; derive it with
 *                      {@link mayJoinOpenCalevent}. Defaults to true so every caller that has
 *                      nothing to do with group calendars keeps the old behaviour.
 * @param isAttendee    true if the current person is already on `calevent.attendees` (any state), e.g.
 *                      signed up through a personal answer link from outside the group: whoever is on
 *                      the list may always change their own answer while the event is answerable.
 */
export function canAttendCalevent(calevent: CalEventModel, hasInvitation: boolean, canJoinOpen = true, isAttendee = false): boolean {
  if (isAttendanceClosed(calevent)) return false;
  return canJoinOpen || hasInvitation || isAttendee || isPersonalCalevent(calevent);
}

/** True when `personKey` is on `calevent.attendees`, whatever their state. False for no key or no list. */
export function isCaleventAttendee(calevent: CalEventModel, personKey: string | undefined): boolean {
  return !!personKey && !!getAttendee(calevent, personKey);
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
  return calendarName === PERSONAL_CALENDAR_KEY || calendarName === 'my';
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
 * @param withCourseKey whether `courseKey` is propagated too — required, no default (spec 1.132 §16): pass
 *        `courseKeyChanged(edited, stored)`, true only when the edit changed it
 * @returns a plain object ready for a Firestore update()
 */
export function getSeriesUpdateFields(edited: CalEventModel, startDate: string, withCourseKey: boolean): Record<string, unknown> {
  const target = { ...edited, startDate };
  const fields: Record<string, unknown> = {
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
    locations: target.locations ?? [],
    calendars: target.calendars,
    url: target.url,
    urlLabel: target.urlLabel,
    responsiblePersons: target.responsiblePersons,
    state: target.state,
    cancelMessage: target.cancelMessage ?? '',
    index: getCaleventIndex(target)
  };
  // the course is shared only when this edit changed it (`courseKeyChanged`): a sibling of a mixed series keeps its own
  if (withCourseKey) fields['courseKey'] = target.courseKey ?? '';
  return fields;
}

/*-------------------------- ATTENDANCE (write paths) --------------------------------*/
/**
 * Fields that only a course trainer may write (Firestore rules deny a calevent update whose changed
 * keys include one of them). Every whole-model calevent write therefore strips them.
 */
export const ATTENDANCE_FIELDS = ['attendance', 'attendanceConfirmedBy', 'attendanceConfirmedAt'] as const;

/** Shallow copy of the calevent without the attendance fields; safe to pass to a whole-model update. */
export function withoutAttendance<T extends CalEventModel>(calevent: T): T {
  const copy = { ...calevent } as Record<string, unknown>;
  for (const key of ATTENDANCE_FIELDS) delete copy[key];
  return copy as T;
}

/**
 * Shallow copy without the attendance fields AND without `courseKey` — the payload of every whole-model calevent
 * update (edit dialog, drag/resize, cancel, series conversion/decoupling, attendee list). None of these paths changes
 * the course assignment (that goes through `CourseService.setCourseKey`), so resending a cached `courseKey` could only
 * revert an assignment made meanwhile in the course table — and the rules would deny it as a course change.
 */
export function withoutCourseFields<T extends CalEventModel>(calevent: T): T {
  const copy = withoutAttendance(calevent) as Record<string, unknown>;
  delete copy['courseKey'];
  return copy as T;
}

/** Attendance values for a freshly created or copied event: nobody recorded, not confirmed. */
export function resetAttendance(): Pick<CalEventModel, 'attendance' | 'attendanceConfirmedBy' | 'attendanceConfirmedAt'> {
  // undefined, not absent: spread over a confirmed source it must overwrite the trainer's avatar; the
  // write paths strip undefined (updateModel removeUndefinedFields, Firestore ignoreUndefinedProperties)
  return { attendance: {}, attendanceConfirmedBy: undefined, attendanceConfirmedAt: '' };
}

/** The occurrences whose attendance has been confirmed by a trainer. */
export function confirmedOccurrences(events: CalEventModel[]): CalEventModel[] {
  return events.filter(e => !!e.attendanceConfirmedAt);
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
  return 'd:' + calevent.startDate + ' n:' + calevent.name + ' p:' + persons + ' l:' + getEventLocationName(calevent) + ' c:' + calevent.calendars.join(',');
}

/**
 * The search index for the anonymous public calendar: the same parts as {@link getCaleventIndex} but WITHOUT the
 * responsible persons' surnames, so the public endpoint can return it without leaking who organises the event.
 * Computed on the fly (never read from the stored `index`, which contains the `p:` part).
 */
export function getPublicCaleventIndex(calevent: Pick<CalEventModel, 'startDate' | 'name' | 'locations' | 'calendars'>): string {
  return 'd:' + calevent.startDate + ' n:' + calevent.name + ' l:' + getEventLocationName(calevent) + ' c:' + calevent.calendars.join(',');
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

/** Cell cycle in the poll table: no answer -> yes -> no -> no answer. */
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
/**
 * The key of the group that owns an event's calendar, '' when none does. The first group calendar
 * in `calendars` counts.
 * @param eventCalendars `calevent.calendars`
 * @param calendars every calendar of the tenant
 */
export function getCaleventGroupKey(eventCalendars: string[] | undefined, calendars: Pick<CalendarModel, 'okey' | 'owner'>[]): string {
  for (const calendarKey of eventCalendars ?? []) {
    const owner = calendars.find(calendar => calendar.okey === calendarKey)?.owner;
    if (owner?.startsWith('group.')) return owner.substring('group.'.length);
  }
  return '';
}

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
 * `listId` ist bewusst 'my' und nicht der Kalender des Termins: der Empfänger muss den Kalender
 * nicht abonniert haben, weil die Liste den Termin per Schlüssel liest (`viewByKey`), nicht aus
 * der geladenen Liste. Und nicht 'all' — das ist die ungefilterte Mandantensicht der eventAdmins;
 * wer das Modal schloss, sah dahinter plötzlich fremde Gruppentermine (2026-11-07).
 */
export function buildCalEventLink(origin: string, okey: string): string {
  return `${origin.replace(/\/$/, '')}/calevent/my/c-calevents?event=${okey}`;
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

/**
 * Put a newly invited person into the event's attendee list, as `'invited'` — i.e. unanswered.
 *
 * Since 2026-09 an invitation and a self-service sign-up share ONE store
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decisions 3+4): the invitation
 * document carries the ask, the attendee entry carries the answer. Writing the entry at invite time
 * is what puts a guest into the same list as the members, visibly pending.
 *
 * `splitAttendees` already handles `'invited'` correctly — it occupies no seat and never blocks the
 * waiting list, so inviting somebody can never push a confirmed attendee out.
 *
 * An answer that is already there is NEVER overwritten, in either direction: re-inviting somebody
 * who accepted leaves them accepted, and somebody who declined stays declined rather than being
 * silently asked again.
 *
 * Pure and non-mutating: the caller writes the returned array back to Firestore.
 *
 * @param attendees `calevent.attendees`; undefined on a legacy document
 * @param person    the invitee
 */
export function addInvitedAttendee(attendees: Attendee[] | undefined, person: AvatarInfo): Attendee[] {
  const all = attendees ?? [];
  if (all.some(attendee => attendee.person.key === person.key)) return all;
  return [...all, { person, state: 'invited' }];
}

/**
 * Takes a person off the attendee list — but only while their entry is still the unanswered
 * 'invited' one that an invitation put there.
 *
 * This is the counterpart of {@link addInvitedAttendee} and runs when an invitation is withdrawn:
 * without it the event keeps an 'invited' attendee whose invitation no longer exists, and that
 * ghost stays in the participant list AND in the recipients of a cancellation
 * (`reachableAttendeeKeys` reads every state except 'declined').
 *
 * An entry the person answered themselves is deliberately left alone. Once somebody has accepted
 * or declined, that answer is their act, not the inviter's — deleting the ask must not delete the
 * answer. Taking an answered person off the event is an explicit admin action instead.
 *
 * Pure and non-mutating.
 *
 * @param attendees `calevent.attendees`; undefined on a legacy document
 * @param personKey the invitee whose unanswered entry should go
 */
export function removeInvitedAttendee(attendees: Attendee[] | undefined, personKey: string): Attendee[] {
  const all = attendees ?? [];
  if (personKey.length === 0) return all;
  return all.filter(attendee => !(attendee.person.key === personKey && attendee.state === 'invited'));
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

/**
 * The attendee list with `actedByKey` set on the subject's entry when somebody else answered for them
 * (Vollmacht, spec 1.180 §4.3), or removed when the subject answered themself (or no actor is given).
 * Everybody else's entries are carried over untouched. Returns the same array when nothing changes,
 * so a self answer on a list that never carried a stamp writes exactly what it wrote before.
 *
 * @param attendees  the list after the answer was applied
 * @param subjectKey personKey of the person whose entry it is
 * @param actedByKey personKey of who answered; undefined or equal to `subjectKey` = a self answer
 */
export function stampActedBy(attendees: Attendee[], subjectKey: string, actedByKey: string | undefined): Attendee[] {
  const delegated = !!actedByKey && actedByKey !== subjectKey;
  const current = attendees.find(attendee => attendee.person.key === subjectKey);
  if (!current) return attendees;
  if (!delegated && !('actedByKey' in current)) return attendees;
  const stamped: Attendee = { ...current };
  if (delegated) stamped.actedByKey = actedByKey;
  else delete stamped.actedByKey;
  return attendees.map(attendee => attendee === current ? stamped : attendee);
}

/**
 * One person's sign-up or cancellation on an event, written by them or for them (Vollmacht, spec 1.180 §5.2).
 *
 * The same two rules as every other attendance write, both inherited from the participant cap, which
 * is derived from ARRAY ORDER (`splitAttendees`):
 *
 * - accepting from a non-accepted state moves the person to the END — re-joining a queue means
 *   joining at the back, never reclaiming an early position;
 * - every other answer is written in place.
 *
 * An existing entry keeps its stored `person`; a new one gets `subject`. `actedByKey` is stamped only
 * when somebody else answers and removed when the subject answers themself (see {@link stampActedBy}).
 *
 * Pure and non-mutating: the caller writes the returned list.
 *
 * @param attendees    `calevent.attendees`; undefined on a legacy document
 * @param subject      the person signed up or off
 * @param newState     the answer
 * @param actedByKey   personKey of who gives the answer (the subject's own key for a self answer)
 * @param maxAttendees `calevent.maxAttendees`; 0, negative or undefined = unrestricted
 * @returns the new list; `isFull` = the cap was reached BEFORE this write; `waitlisted` = this
 *          sign-up lands on the waiting list (it is still recorded)
 */
export function applyAttendanceFor(
  attendees: Attendee[] | undefined,
  subject: AvatarInfo,
  newState: 'accepted' | 'declined',
  actedByKey: string,
  maxAttendees: number | undefined,
): { attendees: Attendee[]; waitlisted: boolean; isFull: boolean } {
  const all = attendees ?? [];
  const cap = maxAttendees ?? 0;
  const isFull = cap > 0 && all.filter(attendee => attendee.state === 'accepted').length >= cap;
  const current = all.find(attendee => attendee.person.key === subject.key);
  const waitlisted = newState === 'accepted' && current?.state !== 'accepted' && isFull;
  let next: Attendee[];
  if (!current) {
    next = [...all, { person: subject, state: newState }];
  } else if (newState === 'accepted' && current.state !== 'accepted') {
    next = [...all.filter(attendee => attendee !== current), { ...current, state: newState }];
  } else {
    next = all.map(attendee => attendee === current ? { ...attendee, state: newState } : attendee);
  }
  return { attendees: stampActedBy(next, subject.key, actedByKey), waitlisted, isFull };
}

/** ActionSheet action prefixes of a sign-up / cancellation for a grantor; the grantor's personKey follows. */
export const SUBSCRIBE_FOR = 'calevent.subscribeFor.';
export const UNSUBSCRIBE_FOR = 'calevent.unsubscribeFor.';

/**
 * What the attendance checks need about one grantor (spec 1.180 §5.2), loaded by the stores per active
 * `calevent.attend` Vollmacht: first name, the calendars of the orgs they belong to, and their invitations.
 */
export type GrantorContext = { key: string; name: string; calendarKeys: string[]; invitations: InvitationModel[] };

/** One person the current user may sign up or off for (Vollmacht), as the ActionSheet needs it. */
export type GrantorAttendCandidate = { key: string; name: string; hasInvitation: boolean; mayJoinOpen: boolean };

/**
 * The grantors for whom the current user may offer «Für {name} anmelden / abmelden» on this event, with
 * each one's current attendance state (`'invited'` when they are not on the list). Every check that
 * runs for the user themself runs for the GRANTOR here (spec 1.180 §5.2): `canAttendCalevent` with
 * the grantor's invitation, the grantor's group reach and the grantor's own attendee entry.
 *
 * One rule is stricter than for the user themself: `canAttendCalevent` lets anybody answer a personal event
 * (its organiser is neither in reach nor invited). A grantor is offered one only when they are invited to it
 * or already on its attendee list — a Vollmacht never opens somebody else's private appointment.
 *
 * @param calevent the event
 * @param grantors per grantor: first name, whether they hold an invitation to this event, and
 *                 `mayJoinOpenCalevent` evaluated with THEIR calendars
 */
export function grantorAttendOptions(calevent: CalEventModel, grantors: GrantorAttendCandidate[]): { key: string; name: string; state: string }[] {
  return grantors
    .filter(g => {
      const isAttendee = isCaleventAttendee(calevent, g.key);
      if (isPersonalCalevent(calevent) && !g.hasInvitation && !isAttendee) return false;
      return canAttendCalevent(calevent, g.hasInvitation, g.mayJoinOpen, isAttendee);
    })
    .map(g => ({ key: g.key, name: g.name, state: getAttendanceState(calevent, g.key) ?? 'invited' }));
}

/**
 * Does `calevent` belong into the calendar VIEW the user is currently looking at?
 *
 * Extracted from `CalEventStore.caleventsResource` so the rule is testable in one place — it is
 * the whole of the app-side visibility model (`firestore.rules` lets every tenant user read
 * `calevents`, see spec 2026-09-06 «Sichtbarkeit — was diese Spec bewusst nicht durchsetzt»).
 *
 * Reach normally comes from the calendar: `calendar.owner` + the user's memberships, resolved
 * into `myCalendarKeys` by the store. **An invitation is the second source of reach** — the spec
 * defines it as «die Bitte um eine Antwort an eine Person ausserhalb der Sichtbarkeit — zugleich
 * die Erlaubnis, genau dieses eine Vorkommen zu sehen». So an invitee sees the event under 'my'
 * although the owning group's calendar is none of theirs, and sees it there only for the one
 * occurrence they hold an invitation for. **The attendee list is the third**: whoever is on
 * `calevent.attendees` (e.g. signed up through a Versand answer link) sees the event under 'my'.
 *
 * @param calevent the event to judge
 * @param view     the store's `calendarName`: 'all' | 'my' | 'personal' | a calendar okey
 * @param ctx      `myCalendarKeys` = calendars of the user's orgs/groups, `personKey` = the
 *                 current user's person, `isInvited` = an invitation of theirs points at this event
 */
export function isCaleventInView(
  calevent: CalEventModel,
  view: string,
  ctx: { myCalendarKeys: string[]; personKey: string; isInvited: boolean },
): boolean {
  // Personal events (no calendar) are visible to their organiser and their invitees only,
  // and never show up in a shared calendar. The 'personal' calendar shows nothing else.
  if (isPersonalCalevent(calevent)) {
    if (view !== 'personal' && view !== 'all' && view !== 'my') return false;
    if (!ctx.personKey) return false;
    const isOrganiser = calevent.responsiblePersons?.some(p => p.key === ctx.personKey) === true;
    return isOrganiser || ctx.isInvited;
  }
  if (view === 'personal') return false;
  if (view === 'all') return true;
  if (view === 'my') {
    // on the attendee list (e.g. signed up through a Versand answer link from outside the group, spec §5.7)
    return ctx.isInvited || isCaleventAttendee(calevent, ctx.personKey)
      || ctx.myCalendarKeys.some(key => calevent.calendars?.includes(key) === true);
  }
  return calevent.calendars?.includes(view) === true;   // explicit calendar okey
}
