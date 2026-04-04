import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AVATAR_INFO_SHAPE, AvatarInfo } from './avatar-info';

/**
 * A group is a collection of persons (members), typically part of an organization.
 * They optionally share a common: Content, Chat, Calendar, Tasks, Files.
 * Groups can be administered by a GroupAdmin. This person can open additional groups and add/remove members.
 */
export class GroupModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique
  public name = DEFAULT_NAME;

  public notes = DEFAULT_NOTES;
  public tags = DEFAULT_TAGS;
  public icon = 'group';

  public hasContent = true; // page id = id
  public hasChat = true; // chat id = id
  public hasCalendar = true; // calendar id = id
  public hasTasks = true; // task id = id
  public hasFiles = true; // path of root folder = groups/id
  public filesFolder = '';
  public hasAlbum = true;
  public albumFolder = '';
  public hasMembers = true;

  public mainContact: AvatarInfo = AVATAR_INFO_SHAPE;
  public admin: AvatarInfo = AVATAR_INFO_SHAPE;

  // hierarchy
  public parentKey = DEFAULT_KEY;
  public parentName = DEFAULT_NAME;
  public parentModelType: 'org' | 'group' = 'org';

  /**
   * Comma-separated list of RoleName values (e.g. 'registered,privileged').
   * Users who have any of these roles can access this group's calendar and chat
   * even if they are not members. Empty string means members-only access (default).
   */
  public visibility = '';

  /**
   * Controls who receives notifications for this group's chat.
   * - 'memberOnly': only registered group members are notified (default).
   * - 'membersAndMatchingVisibility': members + users whose roles match `visibility` are notified.
   */
  public notifyType: 'memberOnly' | 'membersAndMatchingVisibility' = 'memberOnly';

  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const GroupCollection = 'groups';
export const GroupModelName = 'group';
