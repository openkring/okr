import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppConfig, AppConfigCollection } from '@bk2/shared-models';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new AppConfig in the database.
   * @param appConfig the application configuration to store in the database
   * @param key the document id of the AppConfig, if undefined a new random document id will be generated
   * @returns the document id of the newly created AppConfig or undefined if the operation failed
   */
  public async create(appConfig: AppConfig, key: string | undefined): Promise<string | undefined> {
    return this.firestoreService.createObject<AppConfig>(AppConfigCollection, key, appConfig, '@appConfig.operation.create');
  }

  /**
   * Lookup a AppConfig in the database and return it as an Observable.
   * @param key the document id of the AppConfig (= tenantId)
   * @returns an Observable of the AppConfig
   */
  public read(key: string | undefined): Observable<AppConfig | undefined> {
    return this.firestoreService.readObject<AppConfig>(AppConfigCollection, key);
  }

  /**
   * Update an AppConfig in the database with new values.
   * @param appConfig the AppConfig with the new values.
   * @param key the document id of the AppConfig, must be valid (in order to find it in the database)
   * @param message the confirmation message to show in a toast after successful update
   * @returns the document id of the updated AppConfig or undefined if the operation failed
   */
  public async update(appConfig: AppConfig, key: string, message = '@appConfig.operation.update'): Promise<string | undefined> {
    return await this.firestoreService.updateObject<AppConfig>(AppConfigCollection, key, appConfig, message);
  }

  /**
   * We are not actually deleting an AppConfig. We are just archiving it.
   * @param key the document id of the AppConfig
   * @returns a Promise that resolves when the operation is complete 
   */
  public async delete(key: string): Promise<void> {
    await this.firestoreService.deleteObject(AppConfigCollection, key, '@appConfig.operation.delete');
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  
  public list(): Observable<AppConfig[]> {
    return this.firestoreService.listAllObjects<AppConfig>(AppConfigCollection);
  }
}
