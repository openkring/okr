import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME, DEFAULT_URL } from '@bk2/shared-constants';
import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class CalEventModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the event, will be used as its title
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public description = DEFAULT_NOTES; // a detailed description of the event, e.g. agenda or describe a conference
  public type = DEFAULT_CALEVENT_TYPE; // type of the event
  public startDate = DEFAULT_DATE; // start date of the event
  public startTime = DEFAULT_TIME; // start time of the event
  public endDate = DEFAULT_DATE; // end date of the event
  public endTime = DEFAULT_TIME; // end time of the event
  public locationKey = DEFAULT_KEY; // name@key, e.g. 'Bucharest@qwerlkjqrw869sdf'
  public periodicity = DEFAULT_PERIODICITY; // how often the event repeats
  public repeatUntilDate = DEFAULT_DATE; // date until the event repeats
  public calendars: string[] = DEFAULT_CALENDARS; // list of calendar keys this event belongs to
  public url = DEFAULT_URL; // a link to a website or a document
  public responsiblePersons: AvatarInfo[] = []; // list of persons responsible for the event

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalEventCollection = 'calevents'; // collection name for CalEventModel
export const CalEventModelName = 'calevent';
