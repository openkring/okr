import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class CalendarModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the calendar, will be used as its title
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public description = DEFAULT_NOTES; // a detailed description of the calendar
  public owner = ''; // modelType.key of the owner of the calendar, e.g. group.test01
  public title = ''; // title of the calendar, shown in the calendar view
  /**
   * Public: visible and subscribable for every user of the tenant. `false` = only for the members
   * of the group that owns it (`owner`).
   *
   * Was called `defaultIsOpen` until 2026-09 and doubled as the default for `calevent.isOpen`.
   * That second role is gone with `isOpen` itself
   * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 2); what is left is
   * the reach. NEVER read this field directly — stored documents still carry the old name; use
   * `isCalendarPublic` from `@okr/shared-util-core`.
   */
  public isPublic = true;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CalendarCollection = 'calendars'; // collection name for CalendarModel
export const CalendarModelName = 'calendar';