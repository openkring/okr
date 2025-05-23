import { AvatarInfo } from "./avatar-info";
import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { CalEventType } from "./enums/calevent-type.enum";
import { Periodicity } from "./enums/periodicity.enum";

export class CalEventModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = '';                           // a meaningful name for the event, will be used as its title
  public index = '';
  public tags = '';
  public description = '';                    // a detailed description of the event, e.g. agenda or describe a conference
  public type: CalEventType = CalEventType.SocialEvent;
  public startDate = '';
  public startTime = '';
  public endDate = '';
  public endTime = '';
  public locationKey = '';                    // name@key, e.g. 'Bucharest@qwerlkjqrw869sdf'
  public periodicity: Periodicity = Periodicity.Once; 
  public repeatUntilDate = '';
  public calendars: string[] = [];
  public url = '';                           // a link to a website or a document
  public responsiblePersons: AvatarInfo[] = []; 

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalEventCollection = 'calevents';