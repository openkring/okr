import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ResourceCollection, ResourceModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { getResourceIndex } from '@okr/resource-util';
import { ActivityService } from '@okr/activity-data-access';
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
        [`create_conf_${type}`,  PFX + `type.${type}.create.conf`],
        [`create_error_${type}`, PFX + `type.${type}.create.error`],
        [`update_conf_${type}`,  PFX + `type.${type}.update.conf`],
        [`update_error_${type}`, PFX + `type.${type}.update.error`],
        [`delete_conf_${type}`,  PFX + `type.${type}.delete.conf`],
        [`delete_error_${type}`, PFX + `type.${type}.delete.error`],
      ])
    ) as Record<string, string>
  );
  private readonly archiveI18n = this.i18nService.translateAll({
    conf:  PFX + 'archive.conf',
    error: PFX + 'archive.error',
  });

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
    return this.firestoreService.readTenantModel<ResourceModel>(ResourceCollection, key, this.env.tenantId);
  }

  /**
   * Update the values of an existing ResourceModel in the database.
   * @param resource the new values. Must contain a key in field okey so that we are able to find the existing ResourceModel.
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
   * @param resource the ResourceModel to archive. Its okey must be valid so that we can find it in the database.
   * @param currentUser the user who is archiving the resource
   */
  public async delete(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    const payload = `${resource.okey}: ${resource.name}/${resource.type}/${resource.subType}`;
    await this.firestoreService.deleteModel<ResourceModel>(ResourceCollection, resource,
      this.getI18n('delete', 'conf', resource.type), this.getI18n('delete', 'error', resource.type), currentUser);
    void this.activityService.log('resource', 'delete', currentUser, payload);
  }

  /**
   * Archive a ResourceModel (isArchived = true, or detach the current tenant from a shared one — see getDeletePatch).
   * @param resource the ResourceModel to archive. Its okey must be valid so that we can find it in the database.
   * @param currentUser the user who is archiving the resource
   */
  public async archive(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    const payload = `${resource.okey}: ${resource.name}/${resource.type}/${resource.subType}`;
    await this.firestoreService.deleteModel<ResourceModel>(ResourceCollection, resource,
      this.archiveI18n.conf(), this.archiveI18n.error(), currentUser);
    void this.activityService.log('resource', 'archive', currentUser, payload);
  }

  /**
   * Delete a ResourceModel physically in the database. It can not be restored afterwards.
   * The caller is responsible for making sure that nothing refers to it anymore (ownerships)
   * and that it is not shared with other tenants.
   * @param resource the ResourceModel to delete. Its okey must be valid.
   * @param currentUser the user who is deleting the resource
   */
  public async purge(resource: ResourceModel, currentUser?: UserModel): Promise<void> {
    const payload = `${resource.okey}: ${resource.name}/${resource.type}/${resource.subType}`;
    const key = await this.firestoreService.deleteObject(ResourceCollection, resource.okey, this.getI18n('delete', 'conf', resource.type));
    if (key) void this.activityService.log('resource', 'purge', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<ResourceModel[]> {
    return this.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}