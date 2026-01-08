import { DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A group is a collection of persons (members), typically part of an organization.
 * They optionally share a common: Content, Chat, Calendar, Tasks, Files.
 * Groups can be administered by GroupAdmins. They can open additonal groups and add/remove members.
 */
export class GroupModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique
  public name = DEFAULT_NAME;

  public notes = DEFAULT_NOTES;
  public tags = DEFAULT_TAGS;

  public hasContent = true; // page id = id
  public hasChat = true; // chat id = id
  public hasCalendar = true; // calendar id = id
  public hasTasks = true; // task id = id
  public hasFiles = true; // path of root folder = groups/id
  public hasAlbum = true;
  public hasMembers = true;

  // hierarchy
  public parentKey = DEFAULT_KEY;
  public parentName = DEFAULT_NAME;
  public parentModelType: 'org' | 'group' = 'org';

  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const GroupCollection = 'groups';
export const GroupModelName = 'group';
