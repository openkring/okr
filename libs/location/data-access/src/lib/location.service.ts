import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ToastController } from "@ionic/angular/standalone";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { LocationCollection, LocationModel, UserModel } from "@bk2/shared/models";
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from "@bk2/shared/util-core";
import { confirmAction } from "@bk2/shared/util-angular";

import { saveComment } from "@bk2/comment/util";
import { bkTranslate } from "@bk2/shared/i18n";

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
      try {
      location.index = this.getSearchIndex(location);
      const _key = await createModel(this.firestore, LocationCollection, location, this.tenantId);
      await confirmAction(bkTranslate('@location.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, LocationCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@location.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
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
  public async update(location: LocationModel, currentUser?: UserModel, confirmMessage = '@location.operation.update'): Promise<string> {
    try {
      location.index = this.getSearchIndex(location);
      const _key = await updateModel(this.firestore, LocationCollection, location);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, LocationCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }  
  }

  /**
   * Delete a location.
   * We are not actually deleting a location. We are just archiving it.
   * @param key 
   */
  public async delete(location: LocationModel, currentUser?: UserModel) {
    location.isArchived = true;
    await this.update(location, currentUser, '@location.operation.delete');
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