import { DEFAULT_NAME } from '@okr/shared-constants';
import { AgendaItem, AgendaItemKind, AvatarInfo, MeetingAttendee, MeetingModel, TaskModel } from '@okr/shared-models';
import { addIndexElement, isType } from '@okr/shared-util-core';

/*-------------------------- type guard --------------------------------*/

export function isMeeting(meeting: unknown, tenantId: string): meeting is MeetingModel {
  return isType(meeting, new MeetingModel(tenantId));
}

/*-------------------------- factory --------------------------------*/
/**
 * Create a new MeetingModel.
 * @param tenantId the tenant the meeting belongs to
 * @param groupKey the group (Vorstand, Kommission) whose members may read it
 * @param name the display name, e.g. 'Vorstandssitzung 3/2026'
 * @param meetingDate StoreDate of the meeting
 */
export function newMeetingModel(tenantId: string, groupKey = '', name = DEFAULT_NAME, meetingDate = ''): MeetingModel {
  const meeting = new MeetingModel(tenantId);
  meeting.groupKey = groupKey;
  meeting.name = name;
  meeting.meetingDate = meetingDate;
  return meeting;
}

/**
 * Create an agenda item with a locally unique key.
 * The key only has to be unique within one meeting's agenda — it is a track-by
 * handle and the suffix of the action item's task title, not a document id.
 * @param agenda the agenda the item is appended to; its length seeds the key
 * @param title the item title
 * @param kind what the item is for
 */
export function newAgendaItem(agenda: AgendaItem[], title = DEFAULT_NAME, kind: AgendaItemKind = 'discussion'): AgendaItem {
  return {
    key: nextAgendaItemKey(agenda),
    title,
    owner: undefined,
    timeBoxMinutes: 10,
    kind,
    minutes: '',
    decision: '',
    carriedFromMeetingKey: '',
  };
}

/**
 * Return a key that no item of the given agenda uses yet.
 * Items are removable, so the highest existing key + 1 is used rather than the
 * length — reusing a removed item's key would break the task back-links.
 * @param agenda the agenda to derive the next key from
 */
export function nextAgendaItemKey(agenda: AgendaItem[]): string {
  const highest = agenda.reduce((max, item) => {
    const n = Number.parseInt(item.key, 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return String(highest + 1);
}

/*-------------------------- action items --------------------------------*/
/** The `relatedKey` every task of this meeting carries — prefixed per the addresses parentKey convention. */
export function getMeetingRelatedKey(meetingKey: string): string {
  return `meeting.${meetingKey}`;
}

/**
 * Seed the agenda of a follow-up meeting with the previous meeting's unfinished
 * action items — one carried item per open task, ordered as the tasks came in.
 * @param openTasks tasks of the previous meeting that are not completed
 * @param previousMeetingKey okey of the meeting the items come from
 */
export function carryOverAgendaItems(openTasks: TaskModel[], previousMeetingKey: string): AgendaItem[] {
  const carried: AgendaItem[] = [];
  for (const task of openTasks) {
    const item = newAgendaItem(carried, task.name, 'discussion');
    item.owner = task.assignee;
    item.carriedFromMeetingKey = previousMeetingKey;
    carried.push(item);
  }
  return carried;
}

/** A task counts as open while it has no completion date. Legacy docs may omit the field entirely. */
export function isOpenTask(task: TaskModel): boolean {
  return (task.completionDate ?? '') === '' && task.isArchived !== true;
}

/*-------------------------- attendees --------------------------------*/
/**
 * Build the attendee list from a set of persons, all still 'invited'.
 * @param persons the group members to invite
 */
export function newAttendees(persons: AvatarInfo[]): MeetingAttendee[] {
  return persons.map(person => ({ person, state: 'invited' as const }));
}

/** Count the attendees that were actually there — the quorum figure for the minutes. */
export function countPresent(attendees: MeetingAttendee[]): number {
  return attendees.filter(a => a.state === 'present').length;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a meeting based on its values.
 * @param meeting the meeting to index
 */
export function getMeetingIndex(meeting: MeetingModel): string {
  let index = '';
  index = addIndexElement(index, 'n', meeting.name);
  index = addIndexElement(index, 'd', meeting.meetingDate);
  index = addIndexElement(index, 'g', meeting.groupKey);
  if (meeting.chair) {
    index = addIndexElement(index, 'c', meeting.chair.name1 + ' ' + meeting.chair.name2);
  }
  if (meeting.secretary) {
    index = addIndexElement(index, 's', meeting.secretary.name1 + ' ' + meeting.secretary.name2);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 */
export function getMeetingIndexInfo(): string {
  return 'n:name, d:date, g:groupKey, c:chair, s:secretary';
}
