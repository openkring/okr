import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { getCategoryAbbreviation, ResourceTypes } from '@bk2/shared/categories';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { ResourceCollection, ResourceModel, ResourceType, UserModel } from '@bk2/shared/models';
import { addIndexElement, createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

import { getResourceSlug } from '@bk2/resource/util';
import { saveComment } from '@bk2/comment/util';

@Injectable({
    providedIn: 'root'
})
export class ResourceService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new resources
   * @param resource 
   */
  public async create(resource: ResourceModel, currentUser?: UserModel): Promise<string> {
    resource.index = this.getSearchIndex(resource);
    const _key = await createModel(this.firestore, ResourceCollection, resource, this.tenantId, `@resource.${getResourceSlug(resource.type ?? ResourceType.RowingBoat)}.operation.create`);
    await saveComment(this.firestore, this.tenantId, currentUser, ResourceCollection, _key, '@comment.operation.initial.conf');
    return _key;
  }

  /**
   * Read a resource from the database 
   * @param key the document id of the Resource
   * @returns the ResourceModel that has the given key
   */
  public read(key: string): Observable<ResourceModel | undefined> {
    return findByKey<ResourceModel>(this.list(), key);
  }

  /**
   * Update the values of an existing ResourceModel in the database.
   * @param resource the new values. Must contain a key in field bkey so that we are able to find the existing ResourceModel.
   */
  public async update(resource: ResourceModel, confirmMessage = `@resource.${getResourceSlug(resource.type ?? ResourceType.RowingBoat)}.operation.update`): Promise<void> {
    resource.index = this.getSearchIndex(resource);
    await updateModel(this.firestore, ResourceCollection, resource, confirmMessage, this.toastController);
  }

  public async delete(resource: ResourceModel): Promise<void> {
    resource.isArchived = true;
    await this.update(resource, `@resource.${getResourceSlug(resource.type ?? ResourceType.RowingBoat)}.operation.delete`);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<ResourceModel[]> {
    return searchData<ResourceModel>(this.firestore, ResourceCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(resource: ResourceModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', resource.name);
    _index = addIndexElement(_index, 'c', getCategoryAbbreviation(ResourceTypes, resource.type ?? ResourceType.RowingBoat));
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name c:type';
  }  
}