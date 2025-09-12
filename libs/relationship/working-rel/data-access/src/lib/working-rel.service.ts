import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { UserModel, WorkingRelCollection, WorkingRelModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getWorkingRelSearchIndex, getWorkingRelSearchIndexInfo } from '@bk2/relationship-working-rel-util';

@Injectable({
    providedIn: 'root'
})
export class WorkingRelService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations on workingRel --------------------------------*/
  /**
   * Create a new workingRel and save it to the database.
   * @param workingRel the new workingRel to save
   * @param currentUser the user who is creating the workingRel
   * @returns the document id of the stored workingRel in the database or undefined if the operation failed
   */
  public async create(workingRel: WorkingRelModel, currentUser?: UserModel): Promise<string | undefined> {
    workingRel.index = this.getSearchIndex(workingRel);
    return await this.firestoreService.createModel<WorkingRelModel>(WorkingRelCollection, workingRel, '@workingRel.operation.create', currentUser);
  }

  /**
   * Retrieve an existing workingRel from the cached list of all workingRels.
   * @param key the key of the workingRel to retrieve
   * @returns the workingRel as an Observable or undefined if not found
   */
  public read(key: string): Observable<WorkingRelModel | undefined> {
    return findByKey<WorkingRelModel>(this.list(), key);
  }
    
  /**
   * Update an existing workingRel with new values.
   * @param workingRel the workingRel to update
   * @param currentUser the user who is updating the workingRel
   * @param confirmMessage the i18n key for the confirmation message to show in a toast
   * @returns the document id of the updated workingRel or undefined if the operation failed  
   */
  public async update(workingRel: WorkingRelModel, currentUser?: UserModel, confirmMessage = '@workingRel.operation.update'): Promise<string | undefined> {
    workingRel.index = this.getSearchIndex(workingRel);
    return await this.firestoreService.updateModel<WorkingRelModel>(WorkingRelCollection, workingRel, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing workingRel.
   * @param workingRel the workingRel to delete
   * @param currentUser the user who is deleting the workingRel
   * @returns a promise that resolves when the deletion is complete
   */
  public async delete(workingRel: WorkingRelModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<WorkingRelModel>(WorkingRelCollection, workingRel, '@workingRel.operation.delete', currentUser);
  }

  /**
   * End an existing workingRel relationship by setting its validTo date.
   * @param workingRel the workingRel to end
   * @param validTo the end date of the workingRel
   * @param currentUser the user who is ending the workingRel
   * @returns a Promise that resolves to the document id of the updated workingRel or undefined if the operation failed
   */
  public async endWorkingRelByDate(workingRel: WorkingRelModel, validTo: string, currentUser?: UserModel): Promise<string | undefined> {
    if (workingRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      workingRel.validTo = validTo;
      return await this.firestoreService.updateModel<WorkingRelModel>(WorkingRelCollection, workingRel, false, '@workingRel.operation.end', currentUser);
    }
    return undefined;
  }

  /*-------------------------- list --------------------------------*/
  /**
   * List all working relationships.
   * @param orderBy the field to order the list by, default is 'name'
   * @param sortOrder the order to sort the list, default is 'asc'
   * @returns an Observable array of all working relationships
   */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<WorkingRelModel[]> {
    return this.firestoreService.searchData<WorkingRelModel>(WorkingRelCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * List the working relationships of a person
   * @param personKey the document id of the person to look its relationships up
   * @returns an Observable array of the selected working relationships
   */
  public listWorkingRelsOfPerson(personKey: string): Observable<WorkingRelModel[]> {
    if (!personKey || personKey.length === 0) return of([]);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.filter((workingRel: WorkingRelModel) =>
          (workingRel.subjectKey === personKey));
      })
    );
  }

  /**
   * List the workers of an organization
   * @param orgKey the document id of the org to look its relationships up
   * @returns an Observable array of the selected working relationships
   */
  public listWorkersOfOrg(orgKey: string): Observable<WorkingRelModel[]> {
    if (!orgKey || orgKey.length === 0) return of([]);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.filter((workingRel: WorkingRelModel) =>
          (workingRel.objectKey === orgKey));
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('WorkingRelService.export: not yet implemented.');
  }
 
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(workingRel: WorkingRelModel): string {
    return getWorkingRelSearchIndex(workingRel);
  }

  public getSearchIndexInfo(): string {
    return getWorkingRelSearchIndexInfo();
  }
}
