import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { TaskCollection, TaskModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getTaskIndex } from '@bk2/task-util';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new task in the database.
   * @param task the TaskModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created task or undefined if the operation failed
   */
  public async create(task: TaskModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    task.index = getTaskIndex(task);
    return await this.firestoreService.createModel<TaskModel>(TaskCollection, task, '@task.operation.create', currentUser);
  }

  /**
   * Lookup a task in the database by its document id and return it as an Observable.
   * @param key the document id of the task
   * @returns an Observable of the TaskModel or undefined if not found
   */
  public read(key: string | undefined): Observable<TaskModel | undefined> {
    return findByKey<TaskModel>(this.list(), key);    
  }

  /**
   * Update a task in the database with new values.
   * @param task the TaskModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the current user who performs the operation
   * @param confirmMessage an optional confirmation message to show in the UI
   * @returns the key of the updated task or undefined if the operation failed
   */
  public async update(task: TaskModel, currentUser?: UserModel, confirmMessage = '@task.operation.update'): Promise<string | undefined> {
    task.index = getTaskIndex(task);
    return await this.firestoreService.updateModel<TaskModel>(TaskCollection, task, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing task.
   * @param task the task to delete
   * @param currentUser the current user who performs the operation
   * @returns a promise that resolves when the task is deleted
   */
  public async delete(task: TaskModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<TaskModel>(TaskCollection, task, '@task.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  /**
   * List all tasks with optional sorting.
   * @param orderBy the field to order the tasks by, e.g., 'dueDate'
   * @param sortOrder the order to sort the tasks, either 'asc' or 'desc'
   * @returns an Observable of the list of tasks
   */
  public list(orderBy = 'dueDate', sortOrder = 'asc'): Observable<TaskModel[]> {
    return this.firestoreService.searchData(TaskCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  /**
   * Export task data to a local file.
   */
  public export(): void {
    console.log('TaskService.export: not yet implemented.');
  }
}
