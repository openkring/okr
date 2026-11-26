import { AvatarInfo, MandateModel, TaskModel, UserModel } from '@okr/shared-models';

/**
 * The part of `TaskService` (`@okr/project-task-data-access`) the notice needs. Typed structurally so this lib takes no
 * dependency on the task libs: the caller passes its (lazily loaded) TaskService.
 */
export type TaskCreator = {
  create(task: TaskModel, currentUser: UserModel | undefined, options?: { silent?: boolean }): Promise<string | undefined>;
};

/**
 * Tells the grantor that somebody acted for them (spec 1.180 §5.3): a task assigned to the grantor, authored by the
 * acting grantee and linked to the record that changed. It uses the existing task badge and push, and the grantor's
 * task list becomes the history of delegated changes. The task rules let a client create a task whose `author` is the
 * caller (`taskAuthor`).
 *
 * Best effort: the change itself is already written, so a failed notice is logged, never thrown. Silent — the
 * caller shows its own confirmation.
 *
 * @param taskService the TaskService
 * @param mandate     the Vollmacht the change was made under (its okey becomes `relatedKey`, its tenant the task's)
 * @param actor       the grantee who acted (= the current user)
 * @param grantor     the person the change was made for; becomes the assignee
 * @param text        the notice, already translated and filled
 * @param link        the changed record, e.g. `{ modelType: 'calevent', key: <okey> }`
 */
export async function notifyGrantor(
  taskService: TaskCreator,
  mandate: Pick<MandateModel, 'okey' | 'tenants'>,
  actor: AvatarInfo,
  grantor: AvatarInfo,
  text: string,
  link: { modelType: string; key: string },
): Promise<void> {
  const tenantId = mandate.tenants?.[0];
  if (!tenantId || !mandate.okey || !actor.key || !grantor.key) return;
  const task = new TaskModel(tenantId);
  task.name = text;
  task.author = actor;
  task.assignee = grantor;
  task.relatedModelType = 'mandate';
  task.relatedKey = `mandate.${mandate.okey}`;
  task.linkModelType = link.modelType;
  task.linkKey = `${link.modelType}.${link.key}`;
  try {
    const key = await taskService.create(task, undefined, { silent: true });
    if (!key) console.warn(`notifyGrantor: the notice for ${grantor.key} could not be stored.`);
  } catch (error) {
    console.warn('notifyGrantor:', error);
  }
}
