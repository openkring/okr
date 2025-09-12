import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { ModelType } from './enums/model-type.enum';

/**
 * A group is a collection of persons (members), typically part of an organization.
 * They optionally share a common: Content, Chat, Calendar, Tasks, Files.
 * Groups can be administered by GroupAdmins. They can open additonal groups and add/remove members.
 */
export class GroupModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = ''; // unique
  public name = '';
  public id = ''; // unique

  public notes = '';
  public tags = '';

  public hasContent = true; // page id = id
  public hasChat = true; // chat id = id
  public hasCalendar = true; // calendar id = id
  public hasTasks = true; // task id = id
  public hasFiles = true; // path of root folder = groups/id
  public hasAlbum = true;
  public hasMembers = true;

  // hierarchy
  public parentKey = '';
  public parentName = '';
  public parentModelType = ModelType.Org; // org or group

  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const GroupCollection = 'groups';
