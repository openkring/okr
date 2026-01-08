import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class CalendarModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the event, will be used as its title
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public description = DEFAULT_NOTES; // a detailed description of the event, e.g. agenda or describe a conference
  public owner = ''; // modelType.key of the owner of the calendar, e.g. group.test01
  public title = ''; // title of the calendar, shown in the calendar view

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalendarCollection = 'calendars'; // collection name for CalendarModel
export const CalendarModelName = 'calendar';