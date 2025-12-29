import { describe, it, expect, beforeEach } from 'vitest';
import { GroupModel } from '@bk2/shared-models';

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
    group.parentModelType = 'org';
  });

  describe('GroupFormModel functions', () => {
    it('newGroupFormModel should return a default form model', () => {
      const formModel = new GroupModel('tenant-1');
      expect(formModel.name).toBe('');
      expect(formModel.hasChat).toBe(true);
      expect(formModel.parentModelType).toBe('org');
    });
  });
});
