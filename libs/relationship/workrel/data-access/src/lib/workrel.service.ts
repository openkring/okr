import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { UserModel, WorkrelCollection, WorkrelModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getWorkrelSearchIndex, getWorkrelSearchIndexInfo } from '@bk2/relationship-workrel-util';

@Injectable({
    providedIn: 'root'
})
export class WorkrelService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations on workrel --------------------------------*/
  /**
   * Create a new workrel and save it to the database.
   * @param workrel the new workrel to save
   * @param currentUser the user who is creating the workrel
   * @returns the document id of the stored workrel in the database or undefined if the operation failed
   */
  public async create(workrel: WorkrelModel, currentUser?: UserModel): Promise<string | undefined> {
    workrel.index = this.getSearchIndex(workrel);
    return await this.firestoreService.createModel<WorkrelModel>(WorkrelCollection, workrel, '@workrel.operation.create', currentUser);
  }

  /**
   * Retrieve an existing workrel from the cached list of all workrels.
   * @param key the key of the workrel to retrieve
   * @returns the workrel as an Observable or undefined if not found
   */
  public read(key: string): Observable<WorkrelModel | undefined> {
    return findByKey<WorkrelModel>(this.list(), key);
  }
    
  /**
   * Update an existing workrel with new values.
   * @param workrel the workrel to update
   * @param currentUser the user who is updating the workrel
   * @param confirmMessage the i18n key for the confirmation message to show in a toast
   * @returns the document id of the updated workrel or undefined if the operation failed  
   */
  public async update(workrel: WorkrelModel, currentUser?: UserModel, confirmMessage = '@workrel.operation.update'): Promise<string | undefined> {
    workrel.index = this.getSearchIndex(workrel);
    return await this.firestoreService.updateModel<WorkrelModel>(WorkrelCollection, workrel, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing workrel.
   * @param workrel the workrel to delete
   * @param currentUser the user who is deleting the workrel
   * @returns a promise that resolves when the deletion is complete
   */
  public async delete(workrel: WorkrelModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<WorkrelModel>(WorkrelCollection, workrel, '@workrel.operation.delete', currentUser);
  }

  /**
   * End an existing workrel relationship by setting its validTo date.
   * @param workrel the workrel to end
   * @param validTo the end date of the workrel
   * @param currentUser the user who is ending the workrel
   * @returns a Promise that resolves to the document id of the updated workrel or undefined if the operation failed
   */
  public async endWorkrelByDate(workrel: WorkrelModel, validTo: string, currentUser?: UserModel): Promise<string | undefined> {
    if (workrel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      workrel.validTo = validTo;
      return await this.firestoreService.updateModel<WorkrelModel>(WorkrelCollection, workrel, false, '@workrel.operation.end', currentUser);
    }
    return undefined;
  }

  /*-------------------------- list --------------------------------*/
  /**
   * List all work relationships.
   * @param orderBy the field to order the list by, default is 'name'
   * @param sortOrder the order to sort the list, default is 'asc'
   * @returns an Observable array of all work relationships
   */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<WorkrelModel[]> {
    return this.firestoreService.searchData<WorkrelModel>(WorkrelCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * List the work relationships of a person
   * @param personKey the document id of the person to look its relationships up
   * @returns an Observable array of the selected work relationships
   */
  public listWorkrelsOfPerson(personKey: string): Observable<WorkrelModel[]> {
    if (!personKey || personKey.length === 0) return of([]);
    return this.list().pipe(
      map((workrels: WorkrelModel[]) => {
        return workrels.filter((workrel: WorkrelModel) =>
          (workrel.subjectKey === personKey));
      })
    );
  }

  /**
   * List the workers of an organization
   * @param orgKey the document id of the org to look its relationships up
   * @returns an Observable array of the selected work relationships
   */
  public listWorkersOfOrg(orgKey: string): Observable<WorkrelModel[]> {
    if (!orgKey || orgKey.length === 0) return of([]);
    return this.list().pipe(
      map((workrels: WorkrelModel[]) => {
        return workrels.filter((workrel: WorkrelModel) =>
          (workrel.objectKey === orgKey));
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('workrelService.export: not yet implemented.');
  }
 
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(workrel: WorkrelModel): string {
    return getWorkrelSearchIndex(workrel);
  }

  public getSearchIndexInfo(): string {
    return getWorkrelSearchIndexInfo();
  }
}
