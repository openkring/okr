import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { TaskCollection, TaskModel, UserModel } from '@bk2/shared/models';
import { findByKey, getSystemQuery, searchData } from '@bk2/shared/data-access';
import { FIRESTORE, ENV } from '@bk2/shared/config';

import { saveComment } from '@bk2/comment/util';
import { addIndexElement, createModel, updateModel } from '@bk2/shared/util';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new task in the database.
   * @param task the TaskModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created task
   */
  public async create(task: TaskModel, currentUser: UserModel | undefined): Promise<string> {
    task.index = this.getSearchIndex(task);
    const _key = await createModel(this.firestore, TaskCollection, task, this.tenantId, '@task.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, TaskCollection, _key, '@comment.operation.initial.conf');
    return _key;    
  }

  /**
   * Lookup a task in the database by its document id and return it as an Observable.
   * @param key the document id of the task
   * @returns an Observable of the TaskModel
   */
  public read(key: string | undefined): Observable<TaskModel | undefined> {
    return findByKey<TaskModel>(this.list(), key);    
  }

  /**
   * Update a task in the database with new values.
   * @param task the TaskModel with the new values. Its key must be valid (in order to find it in the database)
   * @param confirmMessage the the toast message that is shown as a confirmation
   */
  public async update(task: TaskModel, confirmMessage = '@task.operation.update'): Promise<void> {
    task.index = this.getSearchIndex(task);
    await updateModel(this.firestore, TaskCollection, task, confirmMessage, this.toastController);
  }

  /**
   * Delete an existing task.
   * @param task the task to delete
   * @returns a promise that resolves when the task is deleted
   */
  public async delete(task: TaskModel): Promise<void> {
    task.isArchived = true;
    await this.update(task, '@task.operation.delete');
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(orderBy = 'dueDate', sortOrder = 'asc'): Observable<TaskModel[]> {
    return searchData(this.firestore, TaskCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('TaskService.export: not yet implemented.');
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given task based on its values.
   * @param task 
   * @returns the index string
   */
  public getSearchIndex(task: TaskModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', task.name);
    if (task.author) {
      _index = addIndexElement(_index, 'an', task.author.name1 + ' ' + task.author.name2);
      _index = addIndexElement(_index, 'ak', task.author.key);
    }
    if (task.assignee) {
      _index = addIndexElement(_index, 'asn', task.assignee.name1 + ' ' + task.assignee.name2);
      _index = addIndexElement(_index, 'ask', task.assignee.key);
    }
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getTaskIndexInfo(): string {
    return 'n:name, an:authorname, ak:authorKey, asn:assigneeName, ask:assigneeKey';
  }

}
