import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { CalEventType } from './enums/calevent-type.enum';
import { Periodicity } from './enums/periodicity.enum';

export class CalEventModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = ''; // unique key of the model in the database
  public tenants: string[] = []; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = ''; // a meaningful name for the event, will be used as its title
  public index = ''; // for search
  public tags = ''; // tags for searching and filtering
  public description = ''; // a detailed description of the event, e.g. agenda or describe a conference
  public type: CalEventType = CalEventType.SocialEvent; // type of the event
  public startDate = ''; // start date of the event
  public startTime = ''; // start time of the event
  public endDate = ''; // end date of the event
  public endTime = ''; // end time of the event
  public locationKey = ''; // name@key, e.g. 'Bucharest@qwerlkjqrw869sdf'
  public periodicity: Periodicity = Periodicity.Once; // how often the event repeats
  public repeatUntilDate = ''; // date until the event repeats
  public calendars: string[] = []; // list of calendar keys this event belongs to
  public url = ''; // a link to a website or a document
  public responsiblePersons: AvatarInfo[] = []; // list of persons responsible for the event

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalEventCollection = 'calevents'; // collection name for CalEventModel
