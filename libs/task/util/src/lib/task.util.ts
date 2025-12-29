import { TaskModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

/*-------------------------- type guard --------------------------------*/

export function isTask(task: unknown, tenantId: string): task is TaskModel {
  return isType(task, new TaskModel(tenantId));
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given task based on its values.
 * @param task 
 * @returns the index string
 */
export function getTaskIndex(task: TaskModel): string {
  let index = '';
  index = addIndexElement(index, 'n', task.name);
  if (task.author) {
    index = addIndexElement(index, 'an', task.author.name1 + ' ' + task.author.name2);
    index = addIndexElement(index, 'ak', task.author.key);
  }
  if (task.assignee) {
    index = addIndexElement(index, 'asn', task.assignee.name1 + ' ' + task.assignee.name2);
    index = addIndexElement(index, 'ask', task.assignee.key);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getTaskIndexInfo(): string {
  return 'n:name, an:authorname, ak:authorKey, asn:assigneeName, ask:assigneeKey';
}
