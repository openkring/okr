import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';

/** What an agenda item is for — 'decision' items are the ones that carry a `decision` text. */
export type AgendaItemKind = 'info' | 'discussion' | 'decision';

/**
 * One point of the agenda. Embedded in MeetingModel rather than stored as a
 * subcollection: a meeting has on the order of ten of them, they are never read
 * without the meeting, and the array index is the ordering.
 */
export type AgendaItem = {
  key: string;                    // stable local id — track-by and task back-link
  title: string;
  owner: AvatarInfo | undefined;  // who presents the item
  timeBoxMinutes: number;
  kind: AgendaItemKind;
  minutes: string;                // what was said
  decision: string;               // what was decided (kind === 'decision')
  carriedFromMeetingKey: string;  // '' unless carried over from the previous meeting
};

export type AttendeeState = 'invited' | 'present' | 'excused' | 'absent';

export type MeetingAttendee = {
  person: AvatarInfo;
  state: AttendeeState;
};

export class MeetingModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;   // e.g. 'Vorstandssitzung 3/2026'
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public groupKey = DEFAULT_KEY;      // the group (Vorstand, Kommission) this meeting belongs to — drives visibility
  public calEventKey = DEFAULT_KEY;   // '' or the calevent this meeting is scheduled as

  // denormalised from the calevent so the list can sort without a second read
  public meetingDate = DEFAULT_DATE;  // StoreDate, local wall clock
  public startTime = DEFAULT_TIME;    // StoreTime, local wall clock
  public locationKey = DEFAULT_KEY;   // name@key, same convention as CalEventModel

  public chair: AvatarInfo | undefined;      // Vorsitz
  public secretary: AvatarInfo | undefined;  // Protokoll

  public state: 'draft' | 'invited' | 'held' | 'approved' = 'draft';

  public attendees: MeetingAttendee[] = [];
  public agenda: AgendaItem[] = [];

  public previousMeetingKey = DEFAULT_KEY;   // source of the carried-over agenda items
  public minutesDocumentKey = DEFAULT_KEY;   // the generated minutes PDF

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MeetingCollection = 'meetings';
export const MeetingModelName = 'meeting';
