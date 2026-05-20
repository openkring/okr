import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { GroupCollection, GroupModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { getGroupIndex } from '@bk2/subject-group-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class GroupService  {
  private readonly env = inject(ENV);
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
   * Create a new Group in the database.
   * @param group the GroupModel to store in the database
   * @param currentUser the current user who performs the operation
   * @returns the document id of the newly created Group or undefined if the operation failed
   */ 
  public async create(group: GroupModel, currentUser?: UserModel): Promise<string | undefined> {
    group.index = getGroupIndex(group);
    const key = await this.firestoreService.createModel<GroupModel>(GroupCollection, group, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${group.name}`;
    void this.activityService.log('group', 'create', currentUser, payload);
    return key;
  }
  
  /**
   * Returns the group with the given unique key.
   * @param key the unique key of the group in the database
   * @returns an Observable of the group or undefined if not found
   */
  public read(key?: string): Observable<GroupModel | undefined> {
    return findByKey<GroupModel>(this.list(), key);
  }

  /**
   * Update an existing group.
   * @param group the GroupModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the current user who performs the operation
   * @returns the key of the updated group or undefined if the operation failed
   */
  public async update(group: GroupModel, currentUser?: UserModel): Promise<string | undefined > {
    group.index = getGroupIndex(group);
    const key = await this.firestoreService.updateModel<GroupModel>(GroupCollection, group, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${group.name}`;
    void this.activityService.log('group', 'update', currentUser, payload);
    return key;
  }

  /**
   * Delete an existing group.
   * @param group the GroupModel to delete
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(group: GroupModel, currentUser?: UserModel): Promise<void> {
    const payload = `${group.bkey}: ${group.name}`;
    await this.firestoreService.deleteModel<GroupModel>(GroupCollection, group, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('group', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Returns a list of groups, optionally ordered by a specific field.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of groups
   */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<GroupModel[]> {
    return this.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
