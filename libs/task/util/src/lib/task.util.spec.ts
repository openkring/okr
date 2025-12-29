import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, TaskModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isTask } from './task.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('Task Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let task: TaskModel;
  let author: AvatarInfo;
  let assignee: AvatarInfo;

  beforeEach(() => {
    vi.clearAllMocks();

    author = { key: 'author-1', name1: 'Author Name', name2: '', modelType: 'person', label: '', type: 'person', subType: 'male' };
    assignee = { key: 'assignee-1', name1: 'Assignee Name', name2: '', modelType: 'person', label: '', type: 'person', subType: 'female' };

    task = new TaskModel(tenantId);
    task.bkey = 'task-1';
    task.name = 'Test Task';
    task.notes = 'Some notes';
    task.tags = 'test,task';
    task.author = author;
    task.assignee = assignee;
    task.state = 'planned';
    task.dueDate = '20251224';
    task.completionDate = '';
    task.priority = 'high';
    task.importance = 'high';
    task.calendars = ['cal-1'];
  });

  describe('isTask', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isTask({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(TaskModel));

      mockIsType.mockReturnValue(false);
      expect(isTask({}, tenantId)).toBe(false);
    });
  });
});
