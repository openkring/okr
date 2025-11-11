import { GroupModel } from '@bk2/shared-models';

import { GroupFormModel } from './group-form.model';
import { GroupNewFormModel } from './group-new-form.model';
import { DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

/*-------------------------- ORG --------------------------------*/
export function newGroupFormModel(): GroupFormModel {
  return {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    id: DEFAULT_ID,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    hasContent: true,
    hasChat: true,
    hasCalendar: true,
    hasTasks: true,
    hasFiles: true,
    hasAlbum: true,
    hasMembers: true,

    parentKey: DEFAULT_KEY,
    parentName: DEFAULT_NAME,
    parentModelType: 'org',
  };
}

export function convertGroupToForm(group?: GroupModel): GroupFormModel {
  if (!group) return {};
  return {
    bkey: group.bkey ?? DEFAULT_KEY,
    name: group.name ?? DEFAULT_NAME,
    id: group.id ?? DEFAULT_ID,
    tags: group.tags ?? DEFAULT_TAGS,
    notes: group.notes ?? DEFAULT_NOTES,

    hasContent: group.hasContent ?? true,
    hasChat: group.hasChat ?? true,
    hasCalendar: group.hasCalendar ?? true,
    hasTasks: group.hasTasks ?? true,
    hasFiles: group.hasFiles ?? true,
    hasAlbum: group.hasAlbum ?? true,
    hasMembers: group.hasMembers ?? true,

    parentKey: group.parentKey ?? DEFAULT_KEY,
    parentName: group.parentName ?? DEFAULT_NAME,
    parentModelType: group.parentModelType ?? 'org',
  };
}

export function convertFormToGroup(group: GroupModel | undefined, vm: GroupFormModel, tenantId: string): GroupModel {
  group ??= new GroupModel(tenantId);
  group.bkey = vm.bkey ?? DEFAULT_KEY;
  group.name = vm.name ?? DEFAULT_NAME;
  group.id = vm.id ?? DEFAULT_ID;
  group.notes = vm.notes ?? DEFAULT_NOTES;
  group.tags = vm.tags ?? DEFAULT_TAGS;

  group.hasContent = vm.hasContent ?? true;
  group.hasChat = vm.hasChat ?? true;
  group.hasCalendar = vm.hasCalendar ?? true;
  group.hasTasks = vm.hasTasks ?? true;
  group.hasFiles = vm.hasFiles ?? true;
  group.hasAlbum = vm.hasAlbum ?? true;
  group.hasMembers = vm.hasMembers ?? true;

  group.parentKey = vm.parentKey ?? DEFAULT_KEY;
  group.parentName = vm.parentName ?? DEFAULT_NAME;
  group.parentModelType = vm.parentModelType ?? 'org';
  return group;
}

/*-------------------------- NEW GROUP --------------------------------*/
export function createNewGroupFormModel(): GroupNewFormModel {
  return {
    name: DEFAULT_NAME,
    id: DEFAULT_ID,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    hasContent: true,
    hasChat: true,
    hasCalendar: true,
    hasTasks: true,
    hasFiles: true,
    hasAlbum: true,
    hasMembers: true,

    parentKey: DEFAULT_KEY,
    parentName: DEFAULT_NAME,
    parentModelType: 'org',
  };
}

export function convertFormToNewGroup(vm: GroupNewFormModel, tenantId: string): GroupModel {
  const group = new GroupModel(tenantId);
  group.bkey = DEFAULT_KEY;
  group.name = vm.name ?? DEFAULT_NAME;
  group.id = vm.id ?? DEFAULT_ID;
  group.notes = vm.notes ?? DEFAULT_NOTES;
  group.tags = vm.tags ?? DEFAULT_TAGS;

  group.hasContent = vm.hasContent ?? true;
  group.hasChat = vm.hasChat ?? true;
  group.hasCalendar = vm.hasCalendar ?? true;
  group.hasTasks = vm.hasTasks ?? true;
  group.hasFiles = vm.hasFiles ?? true;
  group.hasAlbum = vm.hasAlbum ?? true;
  group.hasMembers = vm.hasMembers ?? true;

  group.parentKey = vm.parentKey ?? DEFAULT_KEY;
  group.parentName = vm.parentName ?? DEFAULT_NAME;
  group.parentModelType = vm.parentModelType ?? 'org';

  return group;
}
