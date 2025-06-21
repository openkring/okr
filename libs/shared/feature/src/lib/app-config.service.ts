import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { ToastController } from '@ionic/angular/standalone';

import { FIRESTORE } from '@bk2/shared/config';
import { AppConfig, AppConfigCollection } from '@bk2/shared/models';
import { createObject, readObject, updateObject } from '@bk2/shared/util';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new AppConfig in the database.
   * @param appConfig the application configuration to store in the database
   * @returns the document id of the newly created AppConfig
   */
  public async create(appConfig: AppConfig): Promise<string> {
    return createObject<AppConfig>(this.firestore, AppConfigCollection, appConfig, appConfig.tenantId, '@appConfig.operation.create', this.toastController);
  }

  /**
   * Lookup a AppConfig in the database and return it as an Observable.
   * @param key the document id of the AppConfig (= tenantId)
   * @returns an Observable of the AppConfig
   */
  public read(key: string | undefined): Observable<AppConfig | undefined> {
    return readObject<AppConfig>(this.firestore, AppConfigCollection, key);
  }

  /**
   * Update an AppConfig in the database with new values.
   * @param appConfig the AppConfig with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(appConfig: AppConfig, message = '@appConfig.operation.update'): Promise<string> {
    return updateObject<AppConfig>(this.firestore, AppConfigCollection, appConfig.tenantId, appConfig, message, this.toastController);
  }

  /**
   * We are not actually deleting an AppConfig. We are just archiving it.
   * @param appConfig 
   */
  public async delete(appConfig: AppConfig): Promise<void> {
    appConfig.isArchived = true;
    await this.update(appConfig, '@appConfig.operation.delete');
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(): Observable<AppConfig[]> {
      const _collectionRef = collection(this.firestore, AppConfigCollection);
      const _queryRef = query(_collectionRef);
      return collectionData(_queryRef) as Observable<AppConfig[]>;
  }
}
