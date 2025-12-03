import { GroupModel } from '@bk2/shared-models';

import { GroupFormModel } from './group-form.model';
import { GroupNewFormModel } from './group-new-form.model';
import { DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { addIndexElement, die } from '@bk2/shared-util-core';

export function convertGroupToForm(group?: GroupModel): GroupFormModel | undefined {
  if (!group) return undefined;
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

export function convertFormToGroup(vm?: GroupFormModel, group?: GroupModel): GroupModel {
  if (!group) die('group.util.convertFormToGroup: group is mandatory.');
  if (!vm) return group;
  
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


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given group based on its values.
 * @param group the group to generate the index for 
 * @returns the index string
 */
export function getGroupIndex(group: GroupModel): string {
  let index = '';
  index = addIndexElement(index, 'n', group.name);
  index = addIndexElement(index, 'id', group.id);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getGroupIndexInfo(): string {
  return 'n:name id:id';
}