import { CalEventModel, InvitationModel } from '@okr/shared-models';

import { isPastCalevent, toInvitationState } from './calevent.util';
import { SchedulePollColumn, SchedulePollFormData, SchedulePollRow } from './schedule-poll.model';

/** The current user, as far as the attendance table needs them. */
export interface SeriesAttendanceMember {
  key: string;
  firstName: string;
  lastName: string;
}

/**
 * An occurrence the current user may answer. A locked column is shown but never becomes clickable.
 *
 * Since 2026-09 every event is open and the reach of its calendar decides
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md): a member of the owning group
 * answers every occurrence, somebody from outside only the ones they were invited to. That is the
 * whole point of an invitation being per occurrence — a guest rowing three of thirty trainings gets
 * three unlocked columns, not the series.
 *
 * A withdrawn (archived) invitation unlocks nothing.
 *
 * @param calevent    the occurrence
 * @param invitations invitations of the series
 * @param personKey   the current user
 * @param canJoinOpen whether the user is within the reach of the calendar; derive it with
 *                    {@link mayJoinOpenCalevent}. Defaults to true for callers with no group context.
 */
export function canRespondToCalevent(
  calevent: CalEventModel,
  invitations: InvitationModel[],
  personKey: string,
  canJoinOpen = true,
): boolean {
  if (canJoinOpen) return true;
  return invitations.some(inv =>
    inv.caleventKey === calevent.okey && inv.inviteeKey === personKey && !inv.isArchived);
}

/**
 * The occurrences of a series that can still be answered, in calendar order. Past, archived,
 * cancelled and still-proposed ones are dropped: nobody subscribes to those, and a proposal
 * belongs to the schedule poll, not here.
 */
export function upcomingOccurrences(events: CalEventModel[]): CalEventModel[] {
  return events
    .filter(event => !event.isArchived && event.state !== 'proposed' && event.state !== 'cancelled' && !isPastCalevent(event))
    .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
}

/**
 * Builds the tabular series view: one column per upcoming occurrence, one row per person who is
 * either invited to or listed as attendee of any of them, plus the current user.
 *
 * ONE source: `calevent.attendees`. The invitations are still passed in, but only to decide which
 * columns the current user may answer — never where a cell is read from.
 *
 * Until 2026-09 rows carried both sources, and the invitation loop ran after the attendee loop, so
 * in a mixed series the invitation state won purely by loop order: somebody who signed up in the
 * calendar after being invited still showed as pending. Merging the two stores removed the class of
 * bug, not just the instance.
 */
export function buildSeriesAttendanceTable(
  events: CalEventModel[],
  invitations: InvitationModel[],
  me: SeriesAttendanceMember,
  canJoinOpen = true,
): SchedulePollFormData {
  const occurrences = upcomingOccurrences(events);

  const columns: SchedulePollColumn[] = occurrences.map(event => ({
    id: event.okey,
    startDate: event.startDate,
    startTime: event.fullDay ? '' : event.startTime,
    columnLabel: '',
    locked: !canRespondToCalevent(event, invitations, me.key, canJoinOpen),
  }));

  const rowsByKey = new Map<string, SchedulePollRow>();
  const upsert = (key: string, firstName: string, lastName: string): SchedulePollRow => {
    const row = rowsByKey.get(key) ?? { key, firstName, lastName, responses: {}, comment: '' };
    rowsByKey.set(key, row);
    return row;
  };

  for (const event of occurrences) {
    for (const attendee of event.attendees ?? []) {
      const row = upsert(attendee.person.key, attendee.person.name1, attendee.person.name2);
      row.responses[event.okey] = toInvitationState(attendee.state);
    }
  }
  // the current user always gets a row, even before their first answer
  if (me.key) upsert(me.key, me.firstName, me.lastName);

  const rows = [...rowsByKey.values()].sort((a, b) =>
    a.key === me.key ? -1 : b.key === me.key ? 1 : a.lastName.localeCompare(b.lastName));

  return {
    name: occurrences[0]?.name ?? events[0]?.name ?? '',
    description: occurrences[0]?.description ?? '',
    columns,
    rows,
    isDraft: false,
    // series-attendance reuses the poll table but never closes a poll — the mode is irrelevant here
    multiSelect: false,
  };
}
