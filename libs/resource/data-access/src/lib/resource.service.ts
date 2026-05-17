import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { ResourceCollection, ResourceModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getResourceIndex } from '@bk2/resource-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

const RESOURCE_TYPES = ['boat', 'rboat', 'car', 'locker', 'key', 'realestate', 'pet'] as const;

@Injectable({
    providedIn: 'root'
})
export class ResourceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll(
    Object.fromEntries(
      RESOURCE_TYPES.flatMap(type => [
        [`create_conf_${type}`,  PFX + `operation.create.${type}.conf`],
        [`create_error_${type}`, PFX + `operation.create.${type}.error`],
        [`update_conf_${type}`,  PFX + `operation.update.${type}.conf`],
        [`update_error_${type}`, PFX + `operation.update.${type}.error`],
        [`delete_conf_${type}`,  PFX + `operation.delete.${type}.conf`],
        [`delete_error_${type}`, PFX + `operation.delete.${type}.error`],
      ])
    ) as Record<string, string>
  );

  private getI18n(op: 'create' | 'update' | 'delete', kind: 'conf' | 'error', type: string): string {
    const key = `${op}_${kind}_${type}` as keyof typeof this.i18n;
    return this.i18n[key]?.() ?? '';
  }

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new resource
   * @param resource the resource to create
   * @param currentUser the user who is creating the resource
   * @returns the document id of the created resource or undefined if the operation failed
   */
  public async create(resource: ResourceModel, currentUser?: UserModel): Promise<string | undefined> {
    resource.index = getResourceIndex(resource);
    const key = await this.firestoreService.createModel<ResourceModel>(ResourceCollection, resource,
      this.getI18n('create', 'conf', resource.type), this.getI18n('create', 'error', resource.type), currentUser);
    const payload = `${key}: ${resource.name}/${resource.type}/${resource.subType}`;
    void this.activityService.log('resource', 'create', currentUser, payload);
    return key;
  }

  /**
   * Read a resource from the database 
   * @param key the document id of the Resource
   * @returns the ResourceModel that has the given key
   */
  public read(key: string | undefined): Observable<ResourceModel | undefined> {
    return findByKey<ResourceModel>(this.list(), key);
  }

  /**
   * Update the values of an existing ResourceModel in the database.
   * @param resource the new values. Must contain a key in field bkey so that we are able to find the existing ResourceModel.
   * @param currentUser the user who is updating the resource
   * @returns the document id of the updated Resource or undefined if the operation failed
   */
  public async update(resource: ResourceModel, currentUser?: UserModel): Promise<string | undefined> {
    resource.index = getResourceIndex(resource);
    const key = await this.firestoreService.updateModel<ResourceModel>(ResourceCollection, resource, false,
      this.getI18n('update', 'conf', resource.type), this.getI18n('update', 'error', resource.type), currentUser);
    const payload = `${key}: ${resource.name}/${resource.type}/${resource.subType}`;
    void this.activityService.log('resource', 'update', currentUser, payload);
    return key;
  }

  /**
   * Archive a ResourceModel in the database.
   * @param resource the ResourceModel to archive. Its bkey must be valid so that we can find it in the database.
   * @param currentUser the user who is archiving the resource
   */
  public async delete(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    const payload = `${resource.bkey}: ${resource.name}/${resource.type}/${resource.subType}`;
    await this.firestoreService.deleteModel<ResourceModel>(ResourceCollection, resource,
      this.getI18n('delete', 'conf', resource.type), this.getI18n('delete', 'error', resource.type), currentUser);
    void this.activityService.log('resource', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<ResourceModel[]> {
    return this.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}