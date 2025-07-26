import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ENV } from "@bk2/shared/config";
import { LocationCollection, LocationModel, UserModel } from "@bk2/shared/models";
import { findByKey, getSystemQuery } from "@bk2/shared/util-core";
import { FirestoreService } from "@bk2/shared/data-access";

@Injectable({
    providedIn: 'root'
})
export class LocationService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new location in the database.
   * @param location the LocationModel to store in the database
   * @returns the document id of the newly created location
   */
  public async create(location: LocationModel, currentUser?: UserModel): Promise<string | undefined> {
    location.index = this.getSearchIndex(location);
    return await this.firestoreService.createModel<LocationModel>(LocationCollection, location, '@location.operation.create', currentUser);
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
   * @param confirmMessage the confirmation message to show before updating
   * @returns the document id of the updated location or undefined if the operation failed
   */
  public async update(location: LocationModel, currentUser?: UserModel, confirmMessage = '@location.operation.update'): Promise<string | undefined> {
    location.index = this.getSearchIndex(location);
    return await this.firestoreService.updateModel<LocationModel>(LocationCollection, location, false, confirmMessage, currentUser);
  }

  /**
   * Delete a location.
   * We are not actually deleting a location. We are just archiving it.
   * @param location the LocationModel to delete
   * @param currentUser the user performing the operation 
   */
  public async delete(location: LocationModel, currentUser?: UserModel) {
    await this.firestoreService.deleteModel<LocationModel>(LocationCollection, location, '@location.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  public list(orderBy = 'startDate', sortOrder = 'asc'): Observable<LocationModel[]> {
    return this.firestoreService.searchData<LocationModel>(LocationCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
  
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(location: LocationModel): string {
    return 'n:' + location.name + ' w:' + location.what3words;
  }

  public getSearchIndexInfo(): string {
    return 'n:ame w:hat3words';
  }
}