import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, TaskModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';
import { getRelatedIcon, getRelatedModelType, getRelatedRoute, isTask } from './task.util';

// Mock shared utility functions
vi.mock('@okr/shared-util-core', async importOriginal => {
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
    task.okey = 'task-1';
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

  describe('getRelatedModelType', () => {
    it('should return the model type of a relatedKey', () => {
      expect(getRelatedModelType('meeting.abc')).toBe('meeting');
      expect(getRelatedModelType('report.7f1a-2b')).toBe('report');
    });

    it('should return an empty string for an unset relatedKey', () => {
      expect(getRelatedModelType('')).toBe('');
      expect(getRelatedModelType(undefined)).toBe('');
    });
  });

  describe('getRelatedRoute', () => {
    it('should return the detail route of a linkable model type', () => {
      expect(getRelatedRoute('person.p1')).toBe('/person/p1');
      expect(getRelatedRoute('group.g1')).toBe('/group/g1');
      expect(getRelatedRoute('user.u1')).toBe('/user/u1');
    });

    it('should return the list route for meetings and trips', () => {
      expect(getRelatedRoute('meeting.m1')).toBe('/meeting/all/meeting-context');
      expect(getRelatedRoute('trip.t1')).toBe('/trips/logbuch/c-trips');
    });

    it('should return an empty string when there is nothing to navigate to', () => {
      expect(getRelatedRoute('report.7f1a-2b')).toBe('');   // a Schadenmeldung has no document
      expect(getRelatedRoute('membership.m1')).toBe('');
      expect(getRelatedRoute('person')).toBe('');           // no okey
      expect(getRelatedRoute('')).toBe('');
      expect(getRelatedRoute(undefined)).toBe('');
    });
  });

  describe('expense back-link', () => {
    it('routes an expense relatedKey to its detail page', () => {
      expect(getRelatedRoute('expense.abc123')).toBe('/expense/abc123');
    });
    it('has an icon for an expense', () => {
      expect(getRelatedIcon('expense.abc123')).toBe('expense');
    });
    it('still returns nothing for a key with no document behind it', () => {
      expect(getRelatedRoute('report.abc123')).toBe('');
    });
  });
});
