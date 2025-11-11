import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, TaskModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { newTaskFormModel, convertTaskToForm, convertFormToTask, isTask } from './task.util';
import { TaskFormModel } from './task-form.model';

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

    author = { key: 'author-1', name1: 'Author Name', name2: '', modelType: 'person', label: '' };
    assignee = { key: 'assignee-1', name1: 'Assignee Name', name2: '', modelType: 'person', label: '' };

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

  describe('newTaskFormModel', () => {
    it('should return a default form model with correct initial values', () => {
      const formModel = newTaskFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.name).toBe('');
      expect(formModel.state).toBe('initial');
      expect(formModel.priority).toBe('medium');
      expect(formModel.importance).toBe('medium');
      expect(formModel.author).toBeUndefined();
      expect(formModel.assignee).toBeUndefined();
    });

    it('should correctly assign the provided author and assignee', () => {
      const formModel = newTaskFormModel(author, assignee);
      expect(formModel.author).toEqual(author);
      expect(formModel.assignee).toEqual(assignee);
    });
  });

  describe('convertTaskToForm', () => {
    it('should convert a TaskModel to a TaskFormModel', () => {
      const formModel = convertTaskToForm(task);
      expect(formModel.bkey).toBe('task-1');
      expect(formModel.name).toBe('Test Task');
      expect(formModel.author).toEqual(author);
      expect(formModel.state).toBe('planned');
      expect(formModel.priority).toBe('high');
    });
  });

  describe('convertFormToTask', () => {
    let formModel: TaskFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'task-1',
        name: 'Updated Task',
        notes: 'Updated notes',
        tags: 'updated,tags',
        author: author,
        scope: author,
        assignee: assignee,
        state: 'done',
        dueDate: '20251231',
        completionDate: '20251230',
        priority: 'low',
        importance: 'low',
        calendars: ['cal-2'],
      };
    });

    it('should update an existing TaskModel from a form model', () => {
      const updatedTask = convertFormToTask(task, formModel, tenantId);
      expect(updatedTask.name).toBe('Updated Task');
      expect(updatedTask.state).toBe('done');
      expect(updatedTask.priority).toBe('low');
      expect(updatedTask.bkey).toBe('task-1'); // Should not be changed
    });

    it('should create a new TaskModel if one is not provided', () => {
      const newTask = convertFormToTask(undefined, formModel, tenantId);
      expect(newTask).toBeInstanceOf(TaskModel);
      expect(newTask.name).toBe('Updated Task');
      expect(newTask.tenants[0]).toBe(tenantId);
    });

    it('should handle null or undefined values in the form model and apply defaults', () => {
      const partialForm: TaskFormModel = { name: 'Partial Task' } as TaskFormModel;
      const newTask = convertFormToTask(undefined, partialForm, tenantId);
      expect(newTask.name).toBe('Partial Task');
      expect(newTask.notes).toBe('');
      expect(newTask.state).toBe('initial');
      expect(newTask.priority).toBe('medium');
      expect(newTask.calendars).toEqual([]);
    });
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
