import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { map, Observable, of } from 'rxjs';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { GroupCollection, GroupModel, UserModel } from '@bk2/shared/models';
import { addIndexElement, createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';

import { saveComment } from '@bk2/comment/util';
import { bkTranslate } from '@bk2/shared/i18n';

@Injectable({
  providedIn: 'root'
})
export class GroupService  {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(group: GroupModel, currentUser?: UserModel): Promise<string> {
      try {
      group.index = this.getSearchIndex(group);
      const _key = await createModel(this.firestore, GroupCollection, group, this.tenantId);
      await confirmAction(bkTranslate('@subject.group.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, GroupCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@subject.group.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }
  
  /**
   * Returns the group with the given unique key.
   * @param key the unique key of the group in the database
   * @returns an Observable of the group or undefined if not found
   */
  public read(key: string): Observable<GroupModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((groups: GroupModel[]) => {
        return groups.find((group: GroupModel) => group.bkey === key);
      }));
  }

  public async update(group: GroupModel, currentUser?: UserModel, confirmMessage = '@subject.group.operation.update'): Promise<string> {
    try {
      group.index = this.getSearchIndex(group);
      const _key = await updateModel(this.firestore, GroupCollection, group);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, GroupCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  public async delete(group: GroupModel, currentUser?: UserModel): Promise<void> {
    group.isArchived = true;
    await this.update(group, currentUser, `@subject.group.operation.delete`);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'id', sortOrder = 'asc'): Observable<GroupModel[]> {
    return searchData<GroupModel>(this.firestore, GroupCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given group based on its values.
   * @param group the group to generate the index for 
   * @returns the index string
   */
  public getSearchIndex(group: GroupModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', group.name);
    _index = addIndexElement(_index, 'id', group.id);
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name id:id';
  }
}
