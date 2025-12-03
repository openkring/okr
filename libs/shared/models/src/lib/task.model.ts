import { DEFAULT_DATE, DEFAULT_IMPORTANCE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRIORITY, DEFAULT_TAGS, DEFAULT_TASK_STATE, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

export class TaskModel implements BkModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS; // topics used to categorize the tasks (input with tag::name)
  public notes = DEFAULT_NOTES;

  public author: AvatarInfo | undefined; // person.bkey: the person who created the task
  public assignee: AvatarInfo | undefined; // person.bkey: the person responsible for execution

  public state = DEFAULT_TASK_STATE;
  public dueDate = DEFAULT_DATE; // date when the task should be completed
  public completionDate = DEFAULT_DATE; // date when the task should be completed
  public priority = DEFAULT_PRIORITY; // Priority: 0: low, 1: medium, 2: high
  public importance = DEFAULT_IMPORTANCE; // Importance: 0: low, 1: medium, 2: high

  // a task is visible to the author, the assignee, and privileged Users by default
  // the visibility can be extended to the groups it belongs to
  // 'all' is the implicit group of all registered users
  public scope: AvatarInfo | undefined;

  // a task can be shown on its due date in calendars
  public calendars: string[] = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TaskCollection = 'tasks';
export const TaskModelName = 'task';
