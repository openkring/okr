import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { GroupModel, MembershipModel, TaskCollection, TaskModel, UserModel } from '@bk2/shared-models';
import { findByKey, getAvatarInfo, getSystemQuery } from '@bk2/shared-util-core';

import { getTaskIndex } from '@bk2/task-util';
import { ActivityService } from '@bk2/activity-data-access';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new task in the database.
   * @param task the TaskModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created task or undefined if the operation failed
   */
  public async create(task: TaskModel, currentUser: UserModel | undefined): Promise<string | undefined> {
    task.index = getTaskIndex(task);
    const key = await this.firestoreService.createModel<TaskModel>(TaskCollection, task, '@task.operation.create', currentUser);
    void this.activityService.log('task', 'create', currentUser);
    return key;
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
    const key = await this.firestoreService.updateModel<TaskModel>(TaskCollection, task, false, confirmMessage, currentUser);
    void this.activityService.log('task', 'update', currentUser);
    return key;
  }

  /**
   * Delete an existing task.
   * @param task the task to delete
   * @param currentUser the current user who performs the operation
   * @returns a promise that resolves when the task is deleted
   */
  public async delete(task: TaskModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<TaskModel>(TaskCollection, task, '@task.operation.delete', currentUser);
    void this.activityService.log('task', 'delete', currentUser);
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

  /*-------------------------- other --------------------------------*/
    /**
   * Adds a new task to a group membership. 
   * The task is assigned to the group and the author is the current user. 
   * The task is initially assigned to the mainContact of the group.
   * If the mainContact does not exist, the author is assigned, but can be changed in the task edit modal.
   * This is currently only implemented for memberships in Seeclub Stäfa (orgKey = 'scs').
   * @param membership the membership for which to create the task. We need the membership to get the group (org) for which the task is created and to check if it is a SCS membership.
   * @param group the group to which the task is assigned.
   * @param name the name of the task to create. It should contain all relevant information about the reason for creating the task, so that the responsible person can directly act on it without having to look up additional information.
   * @returns 
   */
  public async addTaskFromGroupMembership(membership: MembershipModel, group?: GroupModel, name?: string, currentUser?: UserModel): Promise<void> {
    console.log('TaskService.addTaskFromGroupMembership: ', { membership, group, name });
    if (!membership || !group || !name || !currentUser) return;
    if (membership.orgKey !== 'scs') return;  
    const author = getAvatarInfo(currentUser, 'user-person');
    if (!author) return;
    const task = new TaskModel(this.env.tenantId);
    task.name = name;
    task.author = author;
    task.assignee = group.mainContact ?? author;
    task.calendars = [group.bkey];  // task is assigned to the group calendar
    await this.create(task, currentUser);
  }
}
