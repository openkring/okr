import { inject, Injectable } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { map, Observable, of } from 'rxjs';

import { saveComment } from '@bk2/comment/util';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { addIndexElement, createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/data-access';
import { GroupCollection, GroupModel, ModelType, UserModel } from '@bk2/shared/models';
import { convertFormToNewGroup, GroupNewFormModel } from '@bk2/group/util';
import { GroupNewModalComponent } from '@bk2/group/feature';


@Injectable({
  providedIn: 'root'
})
export class GroupService  {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(group: GroupModel, currentUser?: UserModel): Promise<string> {
    group.index = this.getSearchIndex(group);
    const _key = await createModel(this.firestore, GroupCollection, group, this.tenantId, '@subject.group.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, GroupCollection, _key, '@comment.operation.initial.conf');
    return _key;
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

  public async update(group: GroupModel, confirmMessage = '@subject.group.operation.update'): Promise<void> {
    group.index = this.getSearchIndex(group);
    await updateModel(this.firestore, GroupCollection, group, confirmMessage, this.toastController);    
  }

  public async delete(group: GroupModel): Promise<void> {
    group.isArchived = true;
    await this.update(group, `@subject.group.operation.delete`);
  }

  /**
   * Show a modal to add a new group.
   */
  public async add(currentUser?: UserModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: GroupNewModalComponent,
      componentProps: {
        currentUser: currentUser
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      const _vm = data as GroupNewFormModel;
      const _key = ModelType.Group + '.' + await this.create(convertFormToNewGroup(_vm, this.tenantId), currentUser);

    }
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
