import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { getCategoryAbbreviation, ResourceTypes } from '@bk2/shared/categories';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { ResourceCollection, ResourceModel, ResourceType, UserModel } from '@bk2/shared/models';
import { addIndexElement, createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';

import { getResourceSlug } from '@bk2/resource/util';
import { saveComment } from '@bk2/comment/util';
import { bkTranslate } from '@bk2/shared/i18n';

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
   * Create a new resource
   * @param resource 
   */
  public async create(resource: ResourceModel, currentUser?: UserModel): Promise<string> {
    const _slug = getResourceSlug(resource.type ?? ResourceType.RowingBoat);
    const _prefix = `@resource.${_slug}.operation.create`;
    try {
      resource.index = this.getSearchIndex(resource);
      const _key = await createModel(this.firestore, ResourceCollection, resource, this.tenantId);
      await confirmAction(bkTranslate(`${_prefix}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, ResourceCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${_prefix}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
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
  public async update(resource: ResourceModel, currentUser?: UserModel, confirmMessage = `@resource.${getResourceSlug(resource.type ?? ResourceType.RowingBoat)}.operation.update`): Promise<string> {
    try {
      resource.index = this.getSearchIndex(resource);
      const _key = await updateModel(this.firestore, ResourceCollection, resource);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, ResourceCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  public async delete(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    resource.isArchived = true;
    await this.update(resource, currentUser, `@resource.${getResourceSlug(resource.type ?? ResourceType.RowingBoat)}.operation.delete`);
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