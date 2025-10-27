import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { GroupCollection, GroupModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, findByKey, getSystemQuery } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class GroupService  {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new Group in the database.
   * @param group the GroupModel to store in the database
   * @param currentUser the current user who performs the operation
   * @returns the document id of the newly created Group or undefined if the operation failed
   */ 
  public async create(group: GroupModel, currentUser?: UserModel): Promise<string | undefined> {
    group.index = this.getSearchIndex(group);
    return await this.firestoreService.createModel<GroupModel>(GroupCollection, group, '@subject.group.operation.create', currentUser);
  }
  
  /**
   * Returns the group with the given unique key.
   * @param key the unique key of the group in the database
   * @returns an Observable of the group or undefined if not found
   */
  public read(key: string): Observable<GroupModel | undefined> {
    return findByKey<GroupModel>(this.list(), key);
  }

  /**
   * Update an existing group.
   * @param group the GroupModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the current user who performs the operation
   * @param confirmMessage an optional confirmation message to show in the UI
   * @returns the key of the updated group or undefined if the operation failed
   */
  public async update(group: GroupModel, currentUser?: UserModel, confirmMessage = '@subject.group.operation.update'): Promise<string | undefined > {
    group.index = this.getSearchIndex(group);
    return await this.firestoreService.updateModel<GroupModel>(GroupCollection, group, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing group.
   * @param group the GroupModel to delete
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(group: GroupModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<GroupModel>(GroupCollection, group, '@subject.group.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Returns a list of groups, optionally ordered by a specific field.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of groups
   */
  public list(orderBy = 'id', sortOrder = 'asc'): Observable<GroupModel[]> {
    return this.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given group based on its values.
   * @param group the group to generate the index for 
   * @returns the index string
   */
  public getSearchIndex(group: GroupModel): string {
    let index = '';
    index = addIndexElement(index, 'n', group.name);
    index = addIndexElement(index, 'id', group.id);
    return index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name id:id';
  }
}
