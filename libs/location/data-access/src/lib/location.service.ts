import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ToastController } from "@ionic/angular/standalone";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { LocationCollection, LocationModel, UserModel } from "@bk2/shared/models";
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from "@bk2/shared/util";

import { saveComment } from "@bk2/comment/util";

@Injectable({
    providedIn: 'root'
})
export class LocationService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new location in the database.
   * @param location the LocationModel to store in the database
   * @returns the document id of the newly created location
   */
  public async create(location: LocationModel, currentUser?: UserModel): Promise<string> {
    location.index = this.getSearchIndex(location);
    const _key = await createModel(this.firestore, LocationCollection, location, this.tenantId, '@location.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, LocationCollection, _key, '@comment.operation.initial.conf');
    return _key;
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
   */
  public async update(location: LocationModel, confirmMessage = '@location.operation.update'): Promise<void> {
    location.index = this.getSearchIndex(location);
    await updateModel(this.firestore, LocationCollection, location, confirmMessage, this.toastController);  
  }

  /**
   * Delete a location.
   * We are not actually deleting a location. We are just archiving it.
   * @param key 
   */
  public async delete(location: LocationModel) {
    location.isArchived = true;
    await this.update(location, '@location.operation.delete');
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  public list(orderBy = 'startDate', sortOrder = 'asc'): Observable<LocationModel[]> {
    return searchData<LocationModel>(this.firestore, LocationCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
  
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(location: LocationModel): string {
    return 'n:' + location.name + ' w:' + location.what3words;
  }

  public getSearchIndexInfo(): string {
    return 'n:ame w:hat3words';
  }
}