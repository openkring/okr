import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ResourceCollection, ResourceModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, findByKey, getSystemQuery } from '@bk2/shared-util-core';

@Injectable({
    providedIn: 'root'
})
export class ResourceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new resource
   * @param resource the resource to create
   * @param currentUser the user who is creating the resource
   * @returns the document id of the created resource or undefined if the operation failed
   */
  public async create(resource: ResourceModel, currentUser?: UserModel): Promise<string | undefined> {
    resource.index = this.getSearchIndex(resource);
    return await this.firestoreService.createModel<ResourceModel>(ResourceCollection, resource, `@resource.${resource.type}.operation.create`, currentUser);
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
   * @param currentUser the user who is updating the resource
   * @param confirmMessage the i18n key for the confirmation message to show in a toast
   * @returns the document id of the updated Resource or undefined if the operation failed
   */
  public async update(resource: ResourceModel, currentUser?: UserModel, confirmMessage = `@resource.${resource.type}.operation.update`): Promise<string | undefined> {
    resource.index = this.getSearchIndex(resource);
    return await this.firestoreService.updateModel<ResourceModel>(ResourceCollection, resource, false, confirmMessage, currentUser);
  }

  /**
   * Archive a ResourceModel in the database.
   * @param resource the ResourceModel to archive. Its bkey must be valid so that we can find it in the database.
   * @param currentUser the user who is archiving the resource
   */
  public async delete(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    const message = `@resource.${resource.type}.operation.delete`;
    await this.firestoreService.deleteModel<ResourceModel>(ResourceCollection, resource, message, currentUser);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<ResourceModel[]> {
    return this.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(resource: ResourceModel): string {
    let index = '';
    index = addIndexElement(index, 'n', resource.name);
    index = addIndexElement(index, 't', resource.type);
    index = addIndexElement(index, 'st', resource.subType);
    return index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name c:type st:subtype';
  }  
}