import { CalEventModel } from '@okr/shared-models';

import { toInvitationState } from './calevent.util';
import { SchedulePollColumn, SchedulePollFormData, SchedulePollRow } from './schedule-poll.model';
import { SeriesAttendanceMember } from './series-attendance.util';

/**
 * The live poll table: one column per proposed calevent, one row per group member.
 *
 * The rows come from the GROUP, not from the answers — that is the whole point of the invitation-less
 * poll. A poll no longer writes a document per member up front, so there is nothing to derive rows
 * from until somebody answers; without the membership list the table would start empty and nobody
 * could see who is still missing.
 *
 * Answers are overlaid from each column's `attendees`. An attendee who is no longer a member (they
 * left the group after answering) still gets a row: dropping it would hide an answer the organiser
 * counted on.
 *
 * @param events  the proposed calevents of the poll, already in column order
 * @param members the members of the group owning the calendar
 * @param myKey   personKey of the current user — their row is always sorted first
 */
export function buildSchedulePollTable(
  events: CalEventModel[],
  members: SeriesAttendanceMember[],
  myKey: string,
): SchedulePollFormData {
  const columns: SchedulePollColumn[] = events.map(event => ({
    id: event.okey,
    startDate: event.startDate,
    startTime: event.fullDay ? '' : event.startTime,
    columnLabel: event.columnLabel ?? '',
  }));

  const rowsByKey = new Map<string, SchedulePollRow>();
  const upsert = (key: string, firstName: string, lastName: string): SchedulePollRow => {
    const row = rowsByKey.get(key) ?? { key, firstName, lastName, responses: {}, comment: '' };
    rowsByKey.set(key, row);
    return row;
  };

  for (const member of members) {
    if (member.key) upsert(member.key, member.firstName, member.lastName);
  }
  for (const event of events) {
    for (const attendee of event.attendees ?? []) {
      const row = upsert(attendee.person.key, attendee.person.name1, attendee.person.name2);
      row.responses[event.okey] = toInvitationState(attendee.state);
      // the same comment is written to every column the member answered; any one of them is the truth
      if (attendee.comment) row.comment = attendee.comment;
    }
  }

  const rows = [...rowsByKey.values()].sort((a, b) =>
    a.key === myKey ? -1 : b.key === myKey ? 1 : a.lastName.localeCompare(b.lastName));

  return {
    name: events[0]?.name ?? '',
    description: events[0]?.description ?? '',
    columns,
    rows,
    isDraft: false,
    // legacy polls predate the field — coalesce to false = the v1 single-winner close
    multiSelect: events[0]?.pollMultiSelect === true,
  };
}

/**
 * How many members accepted / answered a given column. The poll header shows both, and it reads
 * them from `attendees` because a poll has no invitations to count.
 */
export function countPollAcceptances(event: CalEventModel): number {
  return (event.attendees ?? []).filter(attendee => attendee.state === 'accepted').length;
}

export function countPollResponses(event: CalEventModel): number {
  return (event.attendees ?? []).length;
}
