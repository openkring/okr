import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { WorkingRelCollection, WorkingRelModel, UserModel } from '@bk2/shared/models';
import { createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

import { saveComment } from '@bk2/comment/util';

import { getWorkingRelSearchIndex, getWorkingRelSearchIndexInfo } from '@bk2/working-rel/util';

@Injectable({
    providedIn: 'root'
})
export class WorkingRelService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  /*-------------------------- CRUD operations on workingRel --------------------------------*/
  /**
   * Create a new workingRel and save it to the database.
   * @param workingRel the new workingRel to save
   * @returns the document id of the stored workingRel in the database
   */
  public async create(workingRel: WorkingRelModel, tenantId: string, currentUser?: UserModel): Promise<string> {
    workingRel.index = this.getSearchIndex(workingRel);
    const _key = await createModel(this.firestore, WorkingRelCollection, workingRel, tenantId, '@workingRel.operation.create', this.toastController);
    await saveComment(this.firestore, tenantId, currentUser, WorkingRelCollection, _key, '@comment.operation.initial.conf');  
    return _key;
  }

  /**
   * Retrieve an existing workingRel from the cached list of all workingRels.
   * @param key the key of the workingRel to retrieve
   * @returns the workingRel as an Observable
   */
  public read(key: string): Observable<WorkingRelModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.find((workingRel: WorkingRelModel) => workingRel.bkey === key);
      }));
  }
    
  /**
   * Update an existing workingRel with new values.
   * @param workingRel the workingRel to update
   * @param i18nPrefix the prefix for the i18n key to use for the toast message (can be used for a delete confirmation)
   */
  public async update(workingRel: WorkingRelModel, confirmMessage = '@workingRel.operation.update'): Promise<void> {
    workingRel.index = this.getSearchIndex(workingRel);
    await updateModel(this.firestore, WorkingRelCollection, workingRel, confirmMessage, this.toastController);
  }

  public async delete(workingRel: WorkingRelModel): Promise<void> {
    workingRel.isArchived = true;
    await this.update(workingRel, `@workingRel.operation.delete`);
  }

  /**
   * End an existing workingRel relationship by setting its validTo date.
   * @param workingRel the workingRel to end
   * @param validTo the end date of the workingRel
   */
  public async endWorkingRelByDate(workingRel: WorkingRelModel, validTo: string, tenantId: string, currentUser?: UserModel): Promise<void> {
    if (workingRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      workingRel.validTo = validTo;
      await this.update(workingRel);
      await saveComment(this.firestore, tenantId, currentUser, WorkingRelCollection, workingRel.bkey, '@comment.message.workingRel.deleted');  
    }
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<WorkingRelModel[]> {
    return searchData<WorkingRelModel>(this.firestore, WorkingRelCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
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
