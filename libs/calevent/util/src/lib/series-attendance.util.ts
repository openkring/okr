import { Attendee, CalEventModel, InvitationModel, InvitationState } from '@okr/shared-models';

import { isPastCalevent } from './calevent.util';
import { SchedulePollColumn, SchedulePollFormData, SchedulePollRow } from './schedule-poll.model';

/** The current user, as far as the attendance table needs them. */
export interface SeriesAttendanceMember {
  key: string;
  firstName: string;
  lastName: string;
}

/**
 * An occurrence the current user may answer: an open event is self-service, a closed one needs an
 * invitation addressed to them. A locked column is shown but never becomes clickable.
 */
export function canRespondToCalevent(calevent: CalEventModel, invitations: InvitationModel[], personKey: string): boolean {
  if (calevent.isOpen) return true;
  return invitations.some(inv => inv.caleventKey === calevent.okey && inv.inviteeKey === personKey);
}

/** An attendee state is the narrower of the two vocabularies — 'invited' is the invitation 'pending'. */
function toInvitationState(state: Attendee['state']): InvitationState {
  return state === 'invited' ? 'pending' : state;
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
 * Rows carry BOTH sources on purpose — a series may mix open occurrences (answers live in
 * `calevent.attendees`) with closed ones (answers live in the invitation). The column decides
 * where a cell is read from and, on save, written back to.
 */
export function buildSeriesAttendanceTable(
  events: CalEventModel[],
  invitations: InvitationModel[],
  me: SeriesAttendanceMember,
): SchedulePollFormData {
  const occurrences = upcomingOccurrences(events);

  const columns: SchedulePollColumn[] = occurrences.map(event => ({
    id: event.okey,
    startDate: event.startDate,
    startTime: event.fullDay ? '' : event.startTime,
    columnLabel: '',
    locked: !canRespondToCalevent(event, invitations, me.key),
  }));

  const columnIds = new Set(columns.map(column => column.id));
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
  for (const invitation of invitations) {
    if (invitation.isArchived || !columnIds.has(invitation.caleventKey)) continue;
    const row = upsert(invitation.inviteeKey, invitation.inviteeFirstName, invitation.inviteeLastName);
    row.responses[invitation.caleventKey] = invitation.state;
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
