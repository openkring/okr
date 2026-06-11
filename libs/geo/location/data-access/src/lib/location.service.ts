import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { I18nService } from "@bk2/shared-i18n";
import { LocationCollection, LocationModel, UserModel } from "@bk2/shared-models";
import { findByKey, getSystemQuery } from "@bk2/shared-util-core";

import { getLocationIndex } from "@bk2/location-util";
import { PFX } from "./scope";

@Injectable({
    providedIn: 'root'
})
export class LocationService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new location in the database.
   * @param location the LocationModel to store in the database
   * @returns the document id of the newly created location
   */
  public async create(location: LocationModel, currentUser?: UserModel): Promise<string | undefined> {
    location.index = getLocationIndex(location);
    return await this.firestoreService.createModel<LocationModel>(LocationCollection, location, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /**
   * Lookup a location in the database by its document id and return it as an Observable.
   * @param key the document id of the location
   * @returns an Observable of the LocationModel
   */
  public read(key: string): Observable<LocationModel | undefined> {
    return findByKey<LocationModel>(this.list(), key);
  }

  /**
   * Update a location in the database with new values.
   * @param location the LocationModel with the new values. Its key must be valid (in order to find it in the database)
   * @param currentUser the user performing the operation
   * @returns the document id of the updated location or undefined if the operation failed
   */
  public async update(location: LocationModel, currentUser?: UserModel): Promise<string | undefined> {
    location.index = getLocationIndex(location);
    return await this.firestoreService.updateModel<LocationModel>(LocationCollection, location, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Delete a location.
   * We are not actually deleting a location. We are just archiving it.
   * @param location the LocationModel to delete
   * @param currentUser the user performing the operation
   */
  public async delete(location: LocationModel, currentUser?: UserModel) {
    await this.firestoreService.deleteModel<LocationModel>(LocationCollection, location, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  public list(type = 'address', orderBy = 'address', sortOrder = 'asc'): Observable<LocationModel[]> {
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'type', operator: '==', value: type});
    return this.firestoreService.searchData<LocationModel>(LocationCollection, query, orderBy, sortOrder);
  }
}