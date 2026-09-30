import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, map, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { DbQuery, TaskCollection, TaskModel, UserModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';

import { getTaskIndex, getTaskShareKey } from '@okr/task-util';
import { ActivityService } from '@okr/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private i18nService = inject(I18nService);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error'
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new task in the database.
   * @param task the TaskModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created task or undefined if the operation failed
   */
  public async create(task: TaskModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    task.index = getTaskIndex(task);
    task.shareKey = getTaskShareKey(task);
    const key = await this.firestoreService.createModel<TaskModel>(TaskCollection, task, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${task.name}/${task.state}`;
    void this.activityService.log('task', 'create', currentUser, payload);
    return key;
  }

  /**
   * Lookup a task in the database by its document id and return it as an Observable.
   * @param key the document id of the task
   * @returns an Observable of the TaskModel or undefined if not found
   */
  public read(key: string | undefined): Observable<TaskModel | undefined> {
    if (!key) return of(undefined);
    return this.firestoreService.readModel<TaskModel>(TaskCollection, key);
  }

  /**
   * Update a task in the database with new values.
   * @param task the TaskModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the current user who performs the operation
   * @returns the key of the updated task or undefined if the operation failed
   */
  public async update(task: TaskModel, currentUser?: UserModel): Promise<string | undefined> {
    task.index = getTaskIndex(task);
    task.shareKey = getTaskShareKey(task);
    const key = await this.firestoreService.updateModel<TaskModel>(TaskCollection, task, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${task.name}/${task.state}`;
    void this.activityService.log('task', 'update', currentUser, payload);
    return key;
  }

  /**
   * Delete an existing task.
   * @param task the task to delete
   * @param currentUser the current user who performs the operation
   * @returns a promise that resolves when the task is deleted
   */
  public async delete(task: TaskModel, currentUser?: UserModel): Promise<void> {
    const payload = `${task.okey}: ${task.name}/${task.state}`;
    await this.firestoreService.deleteModel<TaskModel>(TaskCollection, task, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('task', 'delete', currentUser, payload);
  }

  /*-------------------------- board (Kanban) --------------------------------*/
  /**
   * Persist the Kanban position of a task after a drag-and-drop: its column (state), its
   * order within that column (rank) and the completionDate that must agree with the state.
   *
   * Deliberately does not go through update(): a drag is not a form save. We write only the
   * three fields that changed, with no confirmation toast and no audit comment (updateObject
   * only emits those when passed a confirmMessage / currentUser). The activity log still gets
   * one entry, so the move is traceable.
   */
  public async saveBoardPosition(task: TaskModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateObject(TaskCollection, task.okey, {
      state: task.state,
      rank: task.rank,
      completionDate: task.completionDate,
    }, false);
    void this.activityService.log('task', 'update', currentUser, `${task.okey}: ${task.name}/${task.state}`);
  }

  /**
   * Persist a completion toggle (checkbox or «Erledigt»): only state + completionDate, which
   * must agree (see getCompletionPatch). Like saveBoardPosition, a one-tap action is not a form
   * save — no toast, no audit comment, one activity entry.
   */
  public async saveCompletion(task: TaskModel, patch: Pick<TaskModel, 'state' | 'completionDate'>, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateObject(TaskCollection, task.okey, patch, false);
    void this.activityService.log('task', 'update', currentUser, `${task.okey}: ${task.name}/${patch.state}`);
  }

  /**
   * Persist backfilled ranks for a column whose tasks had none. Silent and unlogged: this is
   * bookkeeping triggered by someone else's drag, not an edit they made.
   */
  public async saveRanks(tasks: TaskModel[]): Promise<void> {
    await Promise.all(tasks.map(task =>
      this.firestoreService.updateObject(TaskCollection, task.okey, { rank: task.rank }, false)
    ));
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  /**
   * Runs several queries and merges them by okey (spec 1.72 §3.2: 'my' = assignee ∪ author).
   * Each query in `queries` must be provable against the Firestore rules of spec 1.72 §3.1 —
   * see {@link buildTaskListQueries}. An empty `queries` array means there is nothing to query.
   * @param queries the query sets to run, as produced by buildTaskListQueries
   * @param orderBy the field to order the merged tasks by, e.g., 'dueDate'
   * @param sortOrder the order to sort the merged tasks, either 'asc' or 'desc'
   * @returns an Observable of the merged, de-duplicated list of tasks
   */
  public listByQueries(queries: DbQuery[][], orderBy = 'dueDate', sortOrder = 'asc'): Observable<TaskModel[]> {
    if (queries.length === 0) return of([]);
    return combineLatest(queries.map(q => this.firestoreService.searchData<TaskModel>(TaskCollection, q, orderBy, sortOrder))).pipe(
      map(lists => {
        const byKey = new Map<string, TaskModel>();
        for (const t of lists.flat()) byKey.set(t.okey, t);
        return [...byKey.values()].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  /**
   * Export task data to a local file.
   */
  public export(): void {
    console.log('TaskService.export: not yet implemented.');
  }

}
