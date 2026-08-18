import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME, DEFAULT_URL } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export type Attendee = {
  person: AvatarInfo;
  state: 'invited' | 'accepted' | 'declined';
}

export class CalEventModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the event, will be used as its title
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public description = DEFAULT_NOTES; // a detailed description of the event, e.g. agenda or describe a conference
  public type = DEFAULT_CALEVENT_TYPE; // type of the event

  public startDate = DEFAULT_DATE; // start date of the event
  public startTime = DEFAULT_TIME; // start time of the event
  public fullDay = false; // whether the event is a full-day event (affects durationMinutes and which fields are shown)
  public durationMinutes = 60; // duration of the event in minutes, 60, 120, 1440 = full day
  public endDate = DEFAULT_DATE; // end date of the event, only for fullDay, multi-day events

  public periodicity = DEFAULT_PERIODICITY; // how often the event repeats
  public repeatUntilDate = DEFAULT_DATE; // date until the event repeats
  public seriesId = DEFAULT_ID; // ID of the series if the event is part of a recurring series

  public locationKey = DEFAULT_KEY; // name@key, e.g. 'Bucharest@qwerlkjqrw869sdf'
  public calendars: string[] = DEFAULT_CALENDARS; // list of calendar keys this event belongs to
  public url = DEFAULT_URL; // a link to a website or a document
  public urlLabel = DEFAULT_LABEL; // the text shown for the url link; falls back to the url itself when empty
  public responsiblePersons: AvatarInfo[] = []; // list of persons responsible for the event

  // attendees are only used for open events, where there are no invitations sent
  public isOpen = false; // whether the event is open to all users or only to invited persons
  public attendees: Attendee[] = []; // list of attendees with their status
  public state: 'proposed' | 'provisional' | 'definitive' | 'cancelled' = 'definitive'; // scheduling state; 'cancelled' = the event was called off
  public cancelMessage = DEFAULT_NOTES; // why the event was cancelled; shown as a red banner, only set when state === 'cancelled'
  public columnLabel = DEFAULT_LABEL; // schedule-poll text column: the header text instead of a date; such events never show in a calendar

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalEventCollection = 'calevents'; // collection name for CalEventModel
export const CalEventModelName = 'calevent';
