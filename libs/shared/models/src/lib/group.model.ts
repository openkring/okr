import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AVATAR_INFO_SHAPE, AvatarInfo } from './avatar-info';

/**
 * A group is a collection of persons (members), typically part of an organization.
 * They optionally share a common: Content, Chat, Calendar, Tasks, Files.
 * Groups can be administered by a GroupAdmin. This person can open additional groups and add/remove members.
 */
export class GroupModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique
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
  public hasMembers = true;

  /**
   * The Matrix room ID (`!opaque:server`) of this group's chat, persisted the first
   * time the room is resolved or created by a Cloud Function. All Matrix CFs resolve
   * the room by this field first, so every CF agrees on a single room and duplicate
   * rooms can no longer be created when the alias/name lookup is ambiguous.
   * Empty until the group's chat is first accessed.
   */
  public matrixRoomId = '';

  // first admin is the also the main contact
  public admins: AvatarInfo[] = [];

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

  /**
   * How a non-member reaches this group's chat (members are unaffected and always
   * land in the shared group room).
   * - 'shared' (default): the non-member is force-joined into the group room itself.
   *   Everyone in the room reads everything — right for open, topical rooms
   *   (a training course, a project).
   * - 'ask': the non-member gets their own room with the whole group — one room per
   *   (person, group), reused across conversations. Right for a group that must be
   *   reachable by everyone but whose traffic is confidential per requester:
   *   Notfall, Support, Vorstand, Kommissionen. Notification scope follows room
   *   membership, so only the group plus that one person are notified.
   * - 'members': only members (and the group's own admins) may enter at all — a
   *   non-member's request is refused. Right for a closed circle whose chat should
   *   mirror the member list exactly (a boat crew, a committee).
   *
   * Why 'members' is a chatMode value and not a separate boolean: the three are
   * mutually exclusive answers to one question — what a NON-member gets — and a
   * second flag would create combinations ('ask' + closed?) with no meaning.
   *
   * Note 'shared' and 'ask' both admit non-members permanently and nothing ever
   * removes them, so a group room drifts from its member list over time. AOC ›
   * Chat › "Nicht-Mitglieder in Gruppen-Chats" reports and prunes that drift
   * (auditGroupRoomMembers / pruneGroupRoomExtras).
   */
  public chatMode: 'shared' | 'ask' | 'members' = 'shared';

  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const GroupCollection = 'groups';
export const GroupModelName = 'group';
