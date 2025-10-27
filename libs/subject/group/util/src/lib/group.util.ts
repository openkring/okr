import { GroupModel, ModelType } from '@bk2/shared-models';

import { GroupFormModel } from './group-form.model';
import { GroupNewFormModel } from './group-new-form.model';

/*-------------------------- ORG --------------------------------*/
export function newGroupFormModel(): GroupFormModel {
  return {
    bkey: '',
    name: '',
    id: '',
    tags: '',
    notes: '',

    hasContent: true,
    hasChat: true,
    hasCalendar: true,
    hasTasks: true,
    hasFiles: true,
    hasAlbum: true,
    hasMembers: true,

    parentKey: '',
    parentName: '',
    parentModelType: ModelType.Org,
  };
}

export function convertGroupToForm(group?: GroupModel): GroupFormModel {
  if (!group) return {};
  return {
    bkey: group.bkey ?? '',
    name: group.name ?? '',
    id: group.id ?? '',
    tags: group.tags ?? '',
    notes: group.notes ?? '',

    hasContent: group.hasContent ?? true,
    hasChat: group.hasChat ?? true,
    hasCalendar: group.hasCalendar ?? true,
    hasTasks: group.hasTasks ?? true,
    hasFiles: group.hasFiles ?? true,
    hasAlbum: group.hasAlbum ?? true,
    hasMembers: group.hasMembers ?? true,

    parentKey: group.parentKey ?? '',
    parentName: group.parentName ?? '',
    parentModelType: group.parentModelType ?? ModelType.Org,
  };
}

export function convertFormToGroup(group: GroupModel | undefined, vm: GroupFormModel, tenantId: string): GroupModel {
  group ??= new GroupModel(tenantId);
  group.bkey = vm.bkey ?? '';
  group.name = vm.name ?? '';
  group.id = vm.id ?? '';
  group.notes = vm.notes ?? '';
  group.tags = vm.tags ?? '';

  group.hasContent = vm.hasContent ?? true;
  group.hasChat = vm.hasChat ?? true;
  group.hasCalendar = vm.hasCalendar ?? true;
  group.hasTasks = vm.hasTasks ?? true;
  group.hasFiles = vm.hasFiles ?? true;
  group.hasAlbum = vm.hasAlbum ?? true;
  group.hasMembers = vm.hasMembers ?? true;

  group.parentKey = vm.parentKey ?? '';
  group.parentName = vm.parentName ?? '';
  group.parentModelType = vm.parentModelType ?? ModelType.Org;
  return group;
}

/*-------------------------- NEW GROUP --------------------------------*/
export function createNewGroupFormModel(): GroupNewFormModel {
  return {
    name: '',
    id: '',
    tags: '',
    notes: '',

    hasContent: true,
    hasChat: true,
    hasCalendar: true,
    hasTasks: true,
    hasFiles: true,
    hasAlbum: true,
    hasMembers: true,

    parentKey: '',
    parentName: '',
    parentModelType: ModelType.Org,
  };
}

export function convertFormToNewGroup(vm: GroupNewFormModel, tenantId: string): GroupModel {
  const group = new GroupModel(tenantId);
  group.bkey = '';
  group.name = vm.name ?? '';
  group.id = vm.id ?? '';
  group.notes = vm.notes ?? '';
  group.tags = vm.tags ?? '';

  group.hasContent = vm.hasContent ?? true;
  group.hasChat = vm.hasChat ?? true;
  group.hasCalendar = vm.hasCalendar ?? true;
  group.hasTasks = vm.hasTasks ?? true;
  group.hasFiles = vm.hasFiles ?? true;
  group.hasAlbum = vm.hasAlbum ?? true;
  group.hasMembers = vm.hasMembers ?? true;

  group.parentKey = vm.parentKey ?? '';
  group.parentName = vm.parentName ?? '';
  group.parentModelType = vm.parentModelType ?? ModelType.Org;

  return group;
}
