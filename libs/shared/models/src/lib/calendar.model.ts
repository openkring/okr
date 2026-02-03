import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class CalendarModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the calendar, will be used as its title
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public description = DEFAULT_NOTES; // a detailed description of the calendar
  public owner = ''; // modelType.key of the owner of the calendar, e.g. group.test01
  public title = ''; // title of the calendar, shown in the calendar view
  public defaultIsOpen = true; // whether the calendar is open to all users or only to invited persons
  // this is the default for each calevent created in this calendar
  // The parameter can be overwritten in each CalEventModel
  // usually, group calendars are closed, org calendards are open

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalendarCollection = 'calendars'; // collection name for CalendarModel
export const CalendarModelName = 'calendar';