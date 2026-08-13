import { DEFAULT_DATE, DEFAULT_IMPORTANCE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRIORITY, DEFAULT_TAGS, DEFAULT_TASK_STATE, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

export class TaskModel implements OkrModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS; // topics used to categorize the tasks (input with tag::name)
  public notes = DEFAULT_NOTES;

  public author: AvatarInfo | undefined; // person.okey: the person who created the task
  public assignee: AvatarInfo | undefined; // person.okey: the person responsible for execution

  public state = DEFAULT_TASK_STATE;
  public dueDate = DEFAULT_DATE; // date when the task should be completed
  public completionDate = DEFAULT_DATE; // date when the task was completed; if set, the task is considered completed
  public priority = DEFAULT_PRIORITY; // Priority: 0: low, 1: medium, 2: high
  public importance = DEFAULT_IMPORTANCE; // Importance: 0: low, 1: medium, 2: high

  // a task is visible to the author, the assignee, and privileged Users by default
  // the visibility can be extended to the group it belongs to, 

  // a task can be shown on its due date in calendars
  public calendars: string[] = [];

  // fractional Kanban rank within its (state) partition; '' = not yet ranked (sorts by dueDate)
  public rank = '';

  // What this task is about — set by the workflow engine (spec 1.35), used for the
  // back-link in the task UI and to deduplicate re-triggered tasks. Legacy documents
  // read these as undefined (Firestore reads do not apply model defaults), so every
  // consumer must coalesce.
  public relatedModelType = '';  // 'membership' | 'person' | …
  public relatedKey = '';        // '<modelType>.<okey>', prefixed per the addresses parentKey convention

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TaskCollection = 'tasks';
export const TaskModelName = 'task';
