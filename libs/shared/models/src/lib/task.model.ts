import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';
import { Importance } from './enums/importance.enum';
import { Priority } from './enums/priority.enum';
import { TaskState } from './enums/task-state.enum';

export class TaskModel implements BkModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = '';
  public index = '';
  public tags = ''; // topics used to categorize the tasks (input with tag::name)
  public notes = '';

  public author: AvatarInfo | undefined; // person.bkey: the person who created the task
  public assignee: AvatarInfo | undefined; // person.bkey: the person responsible for execution

  public state: TaskState = TaskState.Initial;
  public dueDate = ''; // date when the task should be completed
  public completionDate = ''; // date when the task should be completed
  public priority = Priority.Medium; // Priority: 0: low, 1: medium, 2: high
  public importance = Importance.Medium; // Importance: 0: low, 1: medium, 2: high

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
