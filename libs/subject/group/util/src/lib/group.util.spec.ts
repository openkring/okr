import { describe, it, expect, beforeEach } from 'vitest';
import { GroupModel, ModelType } from '@bk2/shared-models';
import { newGroupFormModel, convertGroupToForm, convertFormToGroup, createNewGroupFormModel, convertFormToNewGroup } from './group.util';
import { GroupFormModel } from './group-form.model';
import { GroupNewFormModel } from './group-new-form.model';

describe('Group Utils', () => {
  const tenantId = 'tenant-1';
  let group: GroupModel;

  beforeEach(() => {
    group = new GroupModel(tenantId);
    group.bkey = 'group-key-1';
    group.name = 'Test Group';
    group.id = 'TG1';
    group.tags = 'test,group';
    group.notes = 'Some notes about the group.';
    group.hasContent = false;
    group.hasChat = false;
    group.parentKey = 'parent-key-1';
    group.parentName = 'Parent Org';
    group.parentModelType = ModelType.Org;
  });

  describe('GroupFormModel functions', () => {
    it('newGroupFormModel should return a default form model', () => {
      const formModel = newGroupFormModel();
      expect(formModel.name).toBe('');
      expect(formModel.hasChat).toBe(true);
      expect(formModel.parentModelType).toBe(ModelType.Org);
    });

    it('convertGroupToForm should convert a GroupModel to a GroupFormModel', () => {
      const formModel = convertGroupToForm(group);
      expect(formModel.bkey).toBe('group-key-1');
      expect(formModel.name).toBe('Test Group');
      expect(formModel.hasContent).toBe(false);
    });

    it('convertGroupToForm should return an empty object if group is undefined', () => {
      const formModel = convertGroupToForm();
      expect(formModel).toEqual({});
    });

    it('convertFormToGroup should update an existing GroupModel', () => {
      const formModel: GroupFormModel = {
        bkey: 'group-key-1',
        name: 'Updated Group Name',
        tags: 'updated,tags',
        hasFiles: false,
      };
      const updatedGroup = convertFormToGroup(group, formModel, tenantId);
      expect(updatedGroup.name).toBe('Updated Group Name');
      expect(updatedGroup.tags).toBe('updated,tags');
      expect(updatedGroup.hasFiles).toBe(false);
      expect(updatedGroup.bkey).toBe('group-key-1'); // Should not be changed
    });

    it('convertFormToGroup should create a new GroupModel if one is not provided', () => {
      const formModel: GroupFormModel = { name: 'New Group' };
      const newGroup = convertFormToGroup(undefined, formModel, tenantId);
      expect(newGroup).toBeInstanceOf(GroupModel);
      expect(newGroup.name).toBe('New Group');
      expect(newGroup.tenants[0]).toBe(tenantId);
      expect(newGroup.hasCalendar).toBe(true); // Should use default
    });
  });

  describe('GroupNewFormModel functions', () => {
    it('createNewGroupFormModel should return a default new-group form model', () => {
      const formModel = createNewGroupFormModel();
      expect(formModel.name).toBe('');
      expect(formModel.hasTasks).toBe(true);
      expect(formModel.parentModelType).toBe(ModelType.Org);
    });

    it('convertFormToNewGroup should create a new GroupModel from a GroupNewFormModel', () => {
      const formModel: GroupNewFormModel = {
        name: 'Brand New Group',
        id: 'BNG1',
        notes: 'Notes for the new group',
        hasAlbum: false,
        parentKey: 'parent-key-2',
        parentName: 'Another Parent',
        parentModelType: ModelType.Person,
      };
      const newGroup = convertFormToNewGroup(formModel, tenantId);
      expect(newGroup).toBeInstanceOf(GroupModel);
      expect(newGroup.bkey).toBe('');
      expect(newGroup.name).toBe('Brand New Group');
      expect(newGroup.hasAlbum).toBe(false);
      expect(newGroup.parentModelType).toBe(ModelType.Person);
      expect(newGroup.tenants[0]).toBe(tenantId);
    });
  });
});
